#pragma once

#include "CrokiMarkdownTextRunShadowNode.h"

#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>

namespace facebook::react {
using CrokiMarkdownTextRunComponentDescriptor = ConcreteComponentDescriptor<CrokiMarkdownTextRunShadowNode>;

void CrokiMarkdownTextRunSpec_registerComponentDescriptorsFromCodegen(
  std::shared_ptr<const ComponentDescriptorProviderRegistry> registry);
}
