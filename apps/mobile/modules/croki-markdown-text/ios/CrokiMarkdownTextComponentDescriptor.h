#pragma once

#include "CrokiMarkdownTextShadowNode.h"

#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>

namespace facebook::react {
using CrokiMarkdownTextComponentDescriptor = ConcreteComponentDescriptor<CrokiMarkdownTextShadowNode>;

void CrokiMarkdownTextSpec_registerComponentDescriptorsFromCodegen(
  std::shared_ptr<const ComponentDescriptorProviderRegistry> registry);
}
