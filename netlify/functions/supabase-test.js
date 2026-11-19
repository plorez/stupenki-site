exports.handler = async () => {
  const url = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hasUrl: url,
      hasKey: key,
      ok: url && key
    })
  };
};
