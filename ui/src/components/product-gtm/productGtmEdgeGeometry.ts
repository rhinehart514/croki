export function productGtmBundleOffset(index = 0, count = 1, spacing = 16) {
  return (index - (count - 1) / 2) * spacing;
}
