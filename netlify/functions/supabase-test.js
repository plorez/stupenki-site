exports.handler = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  try {
    const response = await fetch(
      `${url}/rest/v1/cafes?select=id&limit=1`,
      {
        headers: {
          apikey: key
        }
      }
    );

    const body = await response.text();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        httpStatus: response.status,
        response: body.slice(0, 500)
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
