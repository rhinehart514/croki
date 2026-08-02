#import <React/RCTViewManager.h>
#import <React/RCTUIManager.h>
#import "RCTBridge.h"
#import "Utils.h"

@interface CrokiMarkdownTextManager : RCTViewManager
@end

@implementation CrokiMarkdownTextManager

RCT_EXPORT_MODULE(CrokiMarkdownText)

- (UIView *)view
{
  return [[UIView alloc] init];
}

RCT_CUSTOM_VIEW_PROPERTY(color, NSString, UIView)
{
}

@end

@interface CrokiMarkdownTextRunManager : RCTViewManager
@end

@implementation CrokiMarkdownTextRunManager

RCT_EXPORT_MODULE(CrokiMarkdownTextRun)

- (UIView *)view
{
  return nil;
}

@end
