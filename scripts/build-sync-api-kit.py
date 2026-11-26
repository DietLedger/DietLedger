#!/usr/bin/env python3
"""Build/verify the standalone Go Sync API handoff using only the standard library."""

import argparse
import io
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs/sync-api"
SERVER = ROOT / "sync-server"
ARCHIVE = ROOT / "download/dietledger-sync-api-agent-kit.zip"
DOC_NAMES = (
    "AGENTS.md", "BUILD.md", "README.md", "connection.md", "operations.md",
    "recipe-transfer.md", "wire-types.md", "workflows.md", "personal-keys.md",
)
TYPE_SOURCES = (
    "models.go", "custom_recipe_nutrition.go", "dietary_assessment.go",
    "handlers_food.go", "handlers_instance.go", "handlers_recipe_bundle.go",
    "import_bundle.go", "import_quarantine.go", "import_book_decisions.go",
    "personal_key_auth.go", "personal_key_management.go",
)


def wire_catalog(sources, roots):
    # This intentionally reads the small, known Go DTO style (one tagged field
    # per line). Reachable declarations only: e.g. no retired RefreshRequest.
    declarations = {}
    for file in TYPE_SOURCES:
        contents = sources[file]
        for match in re.finditer(r"(?ms)^[ \t]*type (\w+) struct \{\n(.*?)^[ \t]*\}", contents):
            name, body = match.groups()
            fields = {}
            for line in body.splitlines():
                if '`json:"' not in line:
                    if name == "issuedPersonalKey" and line.strip() == "personalKeyMetadata":
                        fields.update(declarations["personalKeyMetadata"]["fields"])
                    continue
                field = re.fullmatch(r'\s*\w+\s+(\S+)\s+`json:"([^" ,]+)(,omitempty)?"`(?:\s*//.*)?\s*', line)
                require(field is not None, f"Unsupported DTO field: {file}: {line}")
                go_type, key, omitted = field.groups()
                if key != "-":
                    fields[key] = {"goType": go_type, "omitEmpty": bool(omitted)}
            if fields:
                declarations[name] = {"source": f"sync-server/{file}", "fields": fields}
    declarations["importPlacements"] = {
        "source": "sync-server/import_quarantine.go", "goType": "map[string]map[string]string",
    }
    require(re.search(r"(?m)^type importPlacements map\[string\]map\[string\]string$", sources["import_quarantine.go"]),
            "Pending-import placements declaration changed")
    pending = set(roots) | {"APIResponse", "IngredientGroupJSON"}
    reachable = {}
    while pending:
        name = pending.pop()
        if name in reachable:
            continue
        require(name in declarations, f"Missing Go DTO: {name}")
        entry = reachable[name] = declarations[name]
        for field in entry.get("fields", {}).values():
            pending.update(set(re.findall(r"\w+", field["goType"])) & declarations.keys())
    return dict(sorted(reachable.items()))


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def operations(text, sources):
    registry = set(re.findall(r'mux\.HandleFunc\("([^"\n]+)"', sources["server.go"]))
    require(registry, "Could not read Go registrations")
    handlers = {}
    for file, contents in sources.items():
        for match in re.finditer(r"(?m)^func \(s \*Server\) (\w+)\(", contents):
            handlers[match[1]] = {"file": f"sync-server/{file}", "line": contents.count("\n", 0, match.start()) + 1,
                                  "symbol": match[1]}
    result = []
    section = ""
    seen, registered = set(), set()
    roots = set()
    for line in text.splitlines():
        if line.startswith("## "):
            section = line[3:]
        if not re.match(r"\| (?:GET|POST|PUT|PATCH|DELETE)\b", line):
            continue
        cells = [cell.strip().strip("`") for cell in line.strip("|").split("|")]
        require(len(cells) == 8 and section, f"Bad operation table row: {line}")
        methods, path, access, query, body, response, handler, notes = cells
        require(handler in handlers, f"Unrecognized Go handler: {handler}")
        require(access in {"Public", "Optional", "Session", "Admin", "Origin", "Cookie", "PersonalKey"}, f"Unknown access: {access}")
        if access == "PersonalKey":
            require(path == "/api/auth/key" and f'personalKeyDiscoveryPath = "{path}"' in sources["personal_key_auth.go"],
                    f"Missing dedicated Go discovery dispatch for {path}")
            registration = path
        else:
            matches = [p for p in registry if p == path or p.endswith("/") and path.startswith(p)]
            require(matches, f"No Go registration for {path}")
            registration = max(matches, key=len)
            registered.add(registration)
        status, shape = response.split(" ", 1)
        query_params = [] if query == "—" else query.replace("page/perPage", "page, perPage").split(", ")
        for parameter in query_params:
            require(re.fullmatch(r"[a-z][a-zA-Z0-9]*!?", parameter), f"Invalid query parameter at {path}: {parameter}")
        for method in methods.split(", "):
            require(method in {"GET", "POST", "PUT", "PATCH", "DELETE"}, f"Invalid method: {method}")
            require((method, path) not in seen, f"Duplicate operation: {method} {path}")
            seen.add((method, path))
            result.append({"group": section, "method": method, "path": path, "access": access,
                           "query": [{"name": key.removesuffix("!"), "required": key.endswith("!")}
                                     for key in query_params],
                           "body": None if body == "—" else body,
                           "response": {"status": int(status), "shape": shape}, "notes": notes,
                           "source": {**handlers[handler], "registration": registration}})
        # Ignore inline keys, envelope markers and transport terms. The few
        # lower-case Go structs used by handlers are rooted explicitly.
        wire_shapes = shape.split(" + ", 1)[0]
        roots.update(re.findall(r"\b[A-Z][a-z]\w*\b", f"{body} {wire_shapes}"))
    roots -= {"Envelope", "Page"}
    roots.update({"resetRequest", "recipeBundleExportRequest", "datasetStatus", "nutrientThreshold",
                  "personalKeyDiscovery", "personalKeyMetadata", "createPersonalKeyRequest", "issuedPersonalKey"})
    require(registered == registry, f"Undocumented Go registrations: {sorted(registry - registered)}")
    return result, roots, len(registry)


def key_scope_markdown(ops):
    spec = (ROOT / "docs/specs/scoped-personal-sync-api-keys.md").read_text(encoding="utf-8")
    table = spec.split("| Scope | Methods | Exact paths |", 1)[1].split("### Boundaries", 1)[0].strip()
    catalog = {(op["method"], op["path"]): op for op in ops}
    for line in table.splitlines():
        if line.startswith("| ---"):
            continue
        scope, methods, paths = (field.strip().strip("`") for field in line.strip("|").split("|"))
        for method in methods.split(", "):
            for path in re.findall(r"`(/api/[^`]+)`", line):
                op = catalog.get((method, path))
                require(op is not None, f"Personal key operation absent from the catalog: {method} {path}")
                if "optional live fallback" in paths:
                    require(op.get("personalKeyScope") == "catalog:read", f"Missing catalog read scope for {path}")
                    op["personalKeyLiveFallbackScope"] = "catalog:live"
                else:
                    require("personalKeyScope" not in op and op["access"] not in {"Admin", "Cookie", "Origin"},
                            f"Duplicate or privileged personal key grant: {method} {path}")
                    op["personalKeyScope"] = None if scope == "Valid personal key" else scope
    return ("# Exact personal-key scopes\n\nGenerated from the approved scoped personal-key spec. "
            "Use with [personal keys](personal-keys.md) and [wire operations](operations.md). "
            "No unlisted method, path or administrator operation is granted.\n\n"
            "| Scope | Methods | Exact paths |\n" + table + "\n")


def wire_markdown(catalog):
    lines = ["# Go wire type reference", "", "Generated from the pinned Go DTO declarations by `scripts/build-sync-api-kit.py`. "
             "Use with [HTTP operations](operations.md) and [workflow rules](workflows.md). Types alone do not imply requiredness, "
             "validation, or update semantics.", "",
             "`*T` is a nullable Go pointer; `[]T` is an array that can be null when nil. `omitempty` may omit a zero/empty "
             "value during encoding; it does not specify whether a caller must send a field. `time.Time` encodes an RFC 3339 "
             "string, `json.RawMessage` is a raw JSON value, and `interface{}` holds route-specific JSON. `string` fields "
             "with embedded JSON stay strings on the wire. Hidden (`json:\"-\"`) and Go-internal fields are not listed. "
             "Inline request/response shapes are in the operation catalog."]
    for name, entry in catalog.items():
        lines.extend(["", f"## `{name}`", "", f"Source: `{entry['source']}`.", ""])
        if "goType" in entry:
            lines.append(f"`{entry['goType']}`")
            continue
        lines.extend(["| JSON field | Go type | Omit empty on encode |", "| --- | --- | --- |"])
        for key, field in entry["fields"].items():
            lines.append(f"| `{key}` | `{field['goType']}` | {'yes' if field['omitEmpty'] else 'no'} |")
    return "\n".join(lines) + "\n"


def check_local_links(files):
    for name, text in files.items():
        for target in re.findall(r"\]\(([^):\s]+\.md(?:#[^\s)]+)?)\)", text):
            path, _, anchor = target.partition("#")
            require(path in files, f"Broken kit link from {name}: {target}")
            if anchor:
                headings = re.findall(r"(?m)^#+ (.+)$", files[path])
                slugs = {re.sub(r"[^\w -]", "", h.lower()).replace(" ", "-") for h in headings}
                require(anchor in slugs, f"Broken kit anchor from {name}: {target}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail instead of regenerating stale files")
    args = parser.parse_args()
    overview = (DOCS / "README.md").read_text(encoding="utf-8")
    pin = re.search(r"\*\*Backend snapshot:\*\* `([0-9a-f]{40})`", overview)
    require(pin, "Missing pinned backend commit in the handoff README")
    revision = pin[1]
    diff = subprocess.run(["git", "diff", "--exit-code", "--quiet", revision, "--", "sync-server"], cwd=ROOT)
    require(diff.returncode == 0, "Go backend differs from handoff snapshot; review behavior before updating the pin")
    untracked = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "--", "sync-server"], cwd=ROOT)
    require(not untracked, "Untracked Go backend files exist; verify the snapshot first")

    sources = {p.name: p.read_text(encoding="utf-8") for p in SERVER.glob("*.go") if not p.name.endswith("_test.go")}
    docs = {n: (DOCS / n).read_text(encoding="utf-8") for n in DOC_NAMES if n != "wire-types.md"}
    ops, roots, registrations = operations(docs["operations.md"], sources)
    types = wire_catalog(sources, roots)
    docs["wire-types.md"] = wire_markdown(types)
    docs["key-scopes.md"] = key_scope_markdown(ops)
    check_local_links(docs)
    encoded = {name: text.encode("utf-8") for name, text in docs.items()}
    encoded["operations.json"] = (json.dumps({"backendRevision": revision, "operations": ops}, ensure_ascii=False, indent=2) + "\n").encode()
    encoded["wire-types.json"] = (json.dumps({"backendRevision": revision, "types": types}, ensure_ascii=False, indent=2) + "\n").encode()
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as kit:
        for name, data in sorted(encoded.items()):
            kit.writestr(zipfile.ZipInfo(name), data)
    for path, data in ((DOCS / "wire-types.md", encoded["wire-types.md"]),
                       (DOCS / "key-scopes.md", encoded["key-scopes.md"]), (ARCHIVE, output.getvalue())):
        if args.check:
            require(path.exists() and path.read_bytes() == data, f"Stale artifact: {path.relative_to(ROOT)}")
        else:
            path.write_bytes(data)
    print(f"Verified {len(ops)} operations, {registrations} Go registrations, {len(types)} wire types, {len(encoded)} kit files.")


if __name__ == "__main__":
    main()
