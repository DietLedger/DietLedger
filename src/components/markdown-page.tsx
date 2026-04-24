'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownPageProps {
  title: string;
  content: string;
}

export default function MarkdownPage({ title, content }: MarkdownPageProps) {
  return (
    <div className="prose prose-stone prose-sm max-w-none">
      {title && <h2 className="text-lg font-semibold text-stone-800 mb-3 border-b border-stone-200 pb-2">{title}</h2>}
      <div className="markdown-content text-stone-700 leading-relaxed">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
