#import "CrokiMarkdownTextRun.h"
#import "CrokiMarkdownText.h"
#import "CrokiMarkdownTextRunComponentDescriptor.h"
#import <react/renderer/components/CrokiMarkdownTextSpec/EventEmitters.h>
#import <react/renderer/components/CrokiMarkdownTextSpec/Props.h>
#import <react/renderer/components/CrokiMarkdownTextSpec/RCTComponentViewHelpers.h>
#import "RCTFabricComponentsPlugins.h"
#import "Utils.h"

using namespace facebook::react;

@interface CrokiMarkdownTextRun () <RCTCrokiMarkdownTextRunViewProtocol>

@end

@implementation CrokiMarkdownTextRun {
  NSString * _text;
  RCTBubblingEventBlock _onPress;
  RCTBubblingEventBlock _onLongPress;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
    return concreteComponentDescriptorProvider<CrokiMarkdownTextRunComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const CrokiMarkdownTextRunProps>();
    _props = defaultProps;
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &oldViewProps = *std::static_pointer_cast<CrokiMarkdownTextRunProps const>(_props);
  const auto &newViewProps = *std::static_pointer_cast<CrokiMarkdownTextRunProps const>(props);

  if (newViewProps.text != oldViewProps.text) {
    NSString *text = [NSString stringWithUTF8String:newViewProps.text.c_str()];
    _text = text;
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)onPress {
  if (_eventEmitter != nullptr) {
    std::dynamic_pointer_cast<const facebook::react::CrokiMarkdownTextRunEventEmitter>(_eventEmitter)
    ->onPress(facebook::react::CrokiMarkdownTextRunEventEmitter::OnPress{});
  }
}

- (void)onLongPress {
  if (_eventEmitter != nullptr) {
    std::dynamic_pointer_cast<const facebook::react::CrokiMarkdownTextRunEventEmitter>(_eventEmitter)
    ->onLongPress(facebook::react::CrokiMarkdownTextRunEventEmitter::OnLongPress{});
  }
}

+ (BOOL)shouldBeRecycled {
  return NO;
}

Class<RCTComponentViewProtocol> CrokiMarkdownTextRunCls(void)
{
    return CrokiMarkdownTextRun.class;
}

@end
