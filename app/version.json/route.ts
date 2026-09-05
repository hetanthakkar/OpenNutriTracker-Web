const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { id: BUILD_ID },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    }
  );
}
