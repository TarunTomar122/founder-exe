import assert from "node:assert/strict";
import test from "node:test";
import { injectValidationRuntime, sanitizePreviewHtml } from "./cloudflare.js";

const page = (body: string) => `<!doctype html><html><head><title>Test</title></head><body>${body}${" ".repeat(220)}</body></html>`;

test("sanitizer removes model-authored network scripts", () => {
  const safe = sanitizePreviewHtml(page(`<script>fetch('https://attacker.invalid')</script><h1>Safe page</h1>`));
  assert.doesNotMatch(safe, /attacker\.invalid/);
  assert.match(safe, /Safe page/);
});

test("sanitizer rejects a fake waitlist success handler", () => {
  assert.throws(() => sanitizePreviewHtml(page(`<form id="waitlist"></form><script>document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); document.body.textContent = 'Thanks, you are on the list'; });</script>`)), /simulates a successful form submission/);
});

test("trusted runtime connects the generated form to attributed Convex capture", () => {
  const html = injectValidationRuntime(page(`<form data-founder-waitlist><input name="email"><button type="submit">Join</button><p data-founder-waitlist-status></p></form>`), "campaign-safe-123");
  assert.match(html, /data-founder-validation-runtime/);
  assert.match(html, /campaign-safe-123/);
  assert.match(html, /convex\.site\/validation/);
  assert.match(html, /endpoint \+ '\/waitlist'/);
  assert.match(html, /utm_source/);
  assert.match(html, /form_start/);
});
