// Canvas is a Croki-owned noun only when the founder has the Canvas open and explicitly asks for a
// spatial projection. Keep this deliberately narrower than general intent classification: ordinary
// coding requests about canvas implementation must still reach the provider's native coding harness.
export function requestsCanvasProjection(message: string) {
  const text = String(message ?? "").replace(/\s+/g, " ").trim();
  if (!text || !/\bcanvas\b/i.test(text)) return false;
  if (/\b(?:figma|figjam|html)\s+canvas\b|\bcanvas\s+(?:element|api)\b/i.test(text)) return false;
  return (
    /\b(?:map|put|place|show|bring|plot|project|add)\b.{0,160}\b(?:on(?:to)?|in(?:to)?|to)\s+(?:(?:the|this|our)\s+)?canvas\b/i.test(text)
    || /\blay\s+out\b.{0,160}\b(?:on(?:to)?|in(?:to)?|to)\s+(?:(?:the|this|our)\s+)?canvas\b/i.test(text)
    || /\b(?:canvas)\s+(?:map|view|projection)\b/i.test(text)
    || /\bmap\b.{0,100}\b(?:product|project|codebase|app|application|experience|journey)\b.{0,100}\bcanvas\b/i.test(text)
  );
}
