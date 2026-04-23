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

export async function DELETE() {
  try {
    await db.$executeRaw`DELETE FROM food_item_fts`;
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
