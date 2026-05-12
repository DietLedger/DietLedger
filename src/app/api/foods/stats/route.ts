import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const [totalCount, byType, recentJobs] = await Promise.all([
      db.foodItem.count(),
      db.foodItem.groupBy({ by: ['dataType'], _count: { dataType: true } }),
      db.seedJob.findMany({
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          dataType: true,
          releaseDate: true,
          recordCount: true,
          status: true,
          completedAt: true,
        },
      }),
    ]);

    const bySource = await db.foodItem.groupBy({ by: ['source'], _count: { source: true } });

    return NextResponse.json({
      totalFoods: totalCount,
      byDataType: byType.map((t) => ({
        dataType: t.dataType,
        count: t._count.dataType,
      })),
      bySource: bySource.map((s) => ({
        source: s.source,
        count: s._count.source,
      })),
      recentJobs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    await db.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS food_item_au AFTER UPDATE ON FoodItem BEGIN
        INSERT INTO food_item_fts(food_item_fts, rowid, description) VALUES('delete', old.id, old.description);
        INSERT INTO food_item_fts(rowid, description) VALUES (new.id, new.description);
      END
    `);

    await db.$executeRawUnsafe('DELETE FROM food_item_fts');
    const BATCH_SIZE = 5000;
    let offset = 0;
    let totalIndexed = 0;

    while (true) {
      const batch = await db.foodItem.findMany({
        select: { id: true, description: true },
        skip: offset,
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) break;

      const values = batch
        .map((item) => `(${item.id}, '${item.description.replace(/'/g, "''")}')`)
        .join(', ');

      await db.$executeRawUnsafe(
        `INSERT INTO food_item_fts(rowid, description) VALUES ${values}`
      );

      totalIndexed += batch.length;
      offset += BATCH_SIZE;
    }

    return NextResponse.json({
      message: 'FTS index rebuilt',
      totalIndexed,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await db.$executeRawUnsafe('DELETE FROM food_item_fts');
    await db.foodItem.deleteMany();
    await db.seedJob.deleteMany();
    return NextResponse.json({ message: 'Database cleared' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
