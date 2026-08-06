export function selectPreviewRequestContext<
  TImage extends { id: string },
  TAnnotation extends { id: string },
>(
  images: readonly TImage[],
  annotations: readonly TAnnotation[],
  selectedAnnotationIds: readonly string[],
): { images: TImage[]; annotations: TAnnotation[] } {
  const annotationIds = new Set(selectedAnnotationIds);
  return {
    annotations: annotations.filter((annotation) => annotationIds.has(annotation.id)),
    images: images.filter((image) => annotationIds.has(image.id)),
  };
}
