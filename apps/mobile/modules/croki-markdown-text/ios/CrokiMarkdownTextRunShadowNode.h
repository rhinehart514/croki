#pragma once

#include <react/renderer/components/CrokiMarkdownTextSpec/EventEmitters.h>
#include <react/renderer/components/CrokiMarkdownTextSpec/Props.h>
#include <react/renderer/components/CrokiMarkdownTextSpec/States.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {
extern const char CrokiMarkdownTextRunComponentName[];

using CrokiMarkdownTextRunShadowNode = ConcreteViewShadowNode<
    CrokiMarkdownTextRunComponentName,
    CrokiMarkdownTextRunProps,
    CrokiMarkdownTextRunEventEmitter,
    CrokiMarkdownTextRunState>;
}
