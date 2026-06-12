// 名刺画像をClaudeに送って構造化JSONを返すAPIルート
// APIキーはサーバー側の環境変数 ANTHROPIC_API_KEY で管理する

export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。.env.local を確認してください。" },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const dataUrl = body.image || "";
  const match = dataUrl.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
  if (!match) {
    return Response.json({ error: "画像データが不正です" }, { status: 400 });
  }
  const mediaType = match[1].toLowerCase();
  const base64 = match[2];

  const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!supported.includes(mediaType)) {
    return Response.json(
      { error: `非対応の画像形式です（${mediaType}）。JPEG/PNGでお試しください。` },
      { status: 400 }
    );
  }

  const prompt =
    "この名刺画像から情報を抽出し、以下のキーを持つJSONオブジェクトのみを返してください。" +
    "前置き・説明・コードブロック記号は一切不要です。読み取れない項目は空文字にしてください。\n" +
    '{"name":"氏名","kana":"ふりがな(なければ空)","company":"会社名","title":"役職",' +
    '"phone":"固定電話","mobile":"携帯電話","email":"メールアドレス",' +
    '"postal":"郵便番号","address":"住所","website":"WebサイトURL"}';

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: data?.error?.message || `Anthropic APIエラー (${res.status})` },
        { status: 502 }
      );
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return Response.json({ error: "読み取り結果の解析に失敗しました" }, { status: 502 });
    }

    const parsed = JSON.parse(clean.slice(start, end + 1));
    return Response.json({ card: parsed });
  } catch (e) {
    return Response.json({ error: "OCR処理に失敗しました: " + e.message }, { status: 500 });
  }
}
