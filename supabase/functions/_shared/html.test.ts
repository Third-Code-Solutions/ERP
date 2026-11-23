import { escapeHtml } from "./html.ts";

Deno.test("email HTML escaping neutralises markup typed into record names", () => {
  const escaped = escapeHtml(`<a href="https://evil.example">Tom & 'Jerry'</a>`);

  if (
    escaped !==
      "&lt;a href=&quot;https://evil.example&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;"
  ) {
    throw new Error(`Unexpected escaped output: ${escaped}`);
  }
});
