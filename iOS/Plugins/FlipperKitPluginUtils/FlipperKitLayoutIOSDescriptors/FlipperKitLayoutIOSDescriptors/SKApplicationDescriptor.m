/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

#ifdef FB_SONARKIT_ENABLED

#import "SKApplicationDescriptor.h"

#import <FlipperKitLayoutHelpers/SKHiddenWindow.h>
#import <objc/runtime.h>

@implementation SKApplicationDescriptor

- (NSString*)identifierForNode:(UIApplication*)node {
  return [NSString stringWithFormat:@"%p", node];
}

- (NSUInteger)childCountForNode:(UIApplication*)node {
  return [[self visibleChildrenForNode:node] count];
}

- (id)childForNode:(UIApplication*)node atIndex:(NSUInteger)index {
  return [self visibleChildrenForNode:node][index];
}

- (void)setHighlighted:(BOOL)highlighted forNode:(UIApplication*)node {
  SKNodeDescriptor* windowDescriptor =
      [self descriptorForClass:[UIWindow class]];
  [windowDescriptor setHighlighted:highlighted forNode:[node keyWindow]];
}

- (UIImage*)getSnapshot:(BOOL)includeChildren forNode:(UIApplication*)node {
  SKNodeDescriptor* descriptor = [self descriptorForClass:[UIView class]];
  return [descriptor getSnapshot:includeChildren forNode:[node keyWindow]];
}

- (void)hitTest:(SKTouch*)touch forNode:(UIApplication*)node {
  bool finish = true;
  for (NSInteger index = [self childCountForNode:node] - 1; index >= 0;
       index--) {
    UIWindow* child = [self childForNode:node atIndex:index];
    if (child.isHidden || child.alpha <= 0) {
      continue;
    }

    if ([touch containedIn:child.frame]) {
      [touch continueWithChildIndex:index withOffset:child.frame.origin];
      finish = false;
    }
  }
  if (finish) {
    [touch finish];
  }
}

- (NSArray<UIWindow*>*)visibleChildrenForNode:(UIApplication*)node {
  NSMutableArray<UIWindow*>* windows = [NSMutableArray new];
  if (@available(iOS 13, *)) {
    for (UIWindowScene* scene in node.connectedScenes) {
      [windows addObjectsFromArray:scene.windows];
    }
  } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    // TODO T202813939 Remove this branch once we drop support for iOS lower
    // than 13
    [windows addObjectsFromArray:node.windows];
  }
#pragma clang diagnostic pop
  NSMutableArray<UIWindow*>* children = [NSMutableArray new];
  for (UIWindow* window in windows) {
    if ([window isKindOfClass:[SKHiddenWindow class]] ||
        [window
            isKindOfClass:objc_lookUpClass("FBAccessibilityOverlayWindow")] ||
        [window isKindOfClass:objc_lookUpClass("UITextEffectsWindow")] ||
        [window isKindOfClass:objc_lookUpClass("FBStatusBarTrackingWindow")]) {
      continue;
    }
    [children addObject:window];
  }
  return children;
}

@end

#endif
