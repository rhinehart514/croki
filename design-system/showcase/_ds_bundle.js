/* @ds-bundle: {"namespace":"GtmIde","components":[{"name":"Badge","sourcePath":"components/general/Badge/Badge.jsx"},{"name":"Button","sourcePath":"components/general/Button/Button.jsx"},{"name":"Card","sourcePath":"components/general/Card/Card.jsx"},{"name":"Chat","sourcePath":"components/general/Chat/Chat.jsx"},{"name":"CitationCard","sourcePath":"components/general/CitationCard/CitationCard.jsx"},{"name":"IconChip","sourcePath":"components/general/IconChip/IconChip.jsx"},{"name":"Input","sourcePath":"components/general/Input/Input.jsx"},{"name":"MediaCard","sourcePath":"components/general/MediaCard/MediaCard.jsx"},{"name":"MetaPill","sourcePath":"components/general/MetaPill/MetaPill.jsx"},{"name":"ProspectCard","sourcePath":"components/general/ProspectCard/ProspectCard.jsx"},{"name":"SectionHeading","sourcePath":"components/general/SectionHeading/SectionHeading.jsx"},{"name":"SegmentedTabs","sourcePath":"components/general/SegmentedTabs/SegmentedTabs.jsx"},{"name":"StatusDot","sourcePath":"components/general/StatusDot/StatusDot.jsx"},{"name":"Textarea","sourcePath":"components/general/Textarea/Textarea.jsx"},{"name":"Toolbar","sourcePath":"components/general/Toolbar/Toolbar.jsx"},{"name":"WorkflowNode","sourcePath":"components/general/WorkflowNode/WorkflowNode.jsx"}],"sourceHashes":{"components/general/Badge/Badge.jsx":"7b8662668df2","components/general/Badge/Badge.d.ts":"76217937ffd7","components/general/Badge/Badge.prompt.md":"b2a3a5902e3d","components/general/Button/Button.jsx":"03ff198de438","components/general/Button/Button.d.ts":"3caf3004c5bb","components/general/Button/Button.prompt.md":"0a778326f101","components/general/Card/Card.jsx":"d1447fd68f86","components/general/Card/Card.d.ts":"8d0431e96b35","components/general/Card/Card.prompt.md":"3b952b73d672","components/general/Chat/Chat.jsx":"a54b304c51c4","components/general/Chat/Chat.d.ts":"bd2b46b6e188","components/general/Chat/Chat.prompt.md":"6951187ffe95","components/general/CitationCard/CitationCard.jsx":"13c30d8d5276","components/general/CitationCard/CitationCard.d.ts":"86ab3c9ffda8","components/general/CitationCard/CitationCard.prompt.md":"15cbfde76f52","components/general/IconChip/IconChip.jsx":"939951612f5c","components/general/IconChip/IconChip.d.ts":"b2d8c91bb13a","components/general/IconChip/IconChip.prompt.md":"05ca027dcdf2","components/general/Input/Input.jsx":"ff8d22ac154f","components/general/Input/Input.d.ts":"fdc8cf329184","components/general/Input/Input.prompt.md":"89a88f1a7e0c","components/general/MediaCard/MediaCard.jsx":"7d4b74f4cc09","components/general/MediaCard/MediaCard.d.ts":"9d08b31a1556","components/general/MediaCard/MediaCard.prompt.md":"96aacfc9def9","components/general/MetaPill/MetaPill.jsx":"42f58e57b5a8","components/general/MetaPill/MetaPill.d.ts":"1636278a67ec","components/general/MetaPill/MetaPill.prompt.md":"583260cd9b26","components/general/ProspectCard/ProspectCard.jsx":"e5f8fbe7b9d3","components/general/ProspectCard/ProspectCard.d.ts":"3e215a4952c9","components/general/ProspectCard/ProspectCard.prompt.md":"023e3b384c62","components/general/SectionHeading/SectionHeading.jsx":"bd26bf56531b","components/general/SectionHeading/SectionHeading.d.ts":"422b90d6f2f1","components/general/SectionHeading/SectionHeading.prompt.md":"8419a212b6c7","components/general/SegmentedTabs/SegmentedTabs.jsx":"5e622d7eb5f9","components/general/SegmentedTabs/SegmentedTabs.d.ts":"0a1d2e39fb59","components/general/SegmentedTabs/SegmentedTabs.prompt.md":"975464089946","components/general/StatusDot/StatusDot.jsx":"cdd3e8a444ab","components/general/StatusDot/StatusDot.d.ts":"d8823647abe7","components/general/StatusDot/StatusDot.prompt.md":"3998a0279bd1","components/general/Textarea/Textarea.jsx":"17231901761d","components/general/Textarea/Textarea.d.ts":"7986a8fbf831","components/general/Textarea/Textarea.prompt.md":"b6c7387f61a2","components/general/Toolbar/Toolbar.jsx":"ac1ad31e7750","components/general/Toolbar/Toolbar.d.ts":"172eca578b55","components/general/Toolbar/Toolbar.prompt.md":"186c084f02aa","components/general/WorkflowNode/WorkflowNode.jsx":"66e7553bd40c","components/general/WorkflowNode/WorkflowNode.d.ts":"6a01a29ef196","components/general/WorkflowNode/WorkflowNode.prompt.md":"b9e8c43df013"},"inlinedExternals":["@radix-ui/react-compose-refs","@radix-ui/react-slot","class-variance-authority","clsx"],"builtBy":"cc-design-sync"} */
"use strict";
var GtmIde = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function jsx2(t, p, k) {
        return R.createElement(t, k === void 0 ? p : Object.assign({ key: k }, p));
      }
      module.exports = R;
      module.exports.jsx = jsx2;
      module.exports.jsxs = jsx2;
      module.exports.jsxDEV = jsx2;
      module.exports.Fragment = R.Fragment;
    }
  });

  // dist/index.js
  var index_exports = {};
  __export(index_exports, {
    Badge: () => Badge,
    Brand: () => Brand,
    Button: () => Button,
    Card: () => Card,
    CardContent: () => CardContent,
    CardDescription: () => CardDescription,
    CardHeader: () => CardHeader,
    CardTitle: () => CardTitle,
    Chat: () => Chat,
    ChatAttachment: () => ChatAttachment,
    ChatComposer: () => ChatComposer,
    ChatDocRef: () => ChatDocRef,
    ChatHeader: () => ChatHeader,
    ChatIconButton: () => ChatIconButton,
    ChatMessage: () => ChatMessage,
    ChatPill: () => ChatPill,
    ChatReply: () => ChatReply,
    ChatToolCall: () => ChatToolCall,
    CitationCard: () => CitationCard,
    IconChip: () => IconChip,
    Input: () => Input,
    MediaCard: () => MediaCard,
    MetaPill: () => MetaPill,
    ProspectCard: () => ProspectCard,
    SectionHeading: () => SectionHeading,
    SegmentedTabs: () => SegmentedTabs,
    StatusDot: () => StatusDot,
    Textarea: () => Textarea,
    Toolbar: () => Toolbar,
    ToolbarDivider: () => ToolbarDivider,
    ToolbarSpacer: () => ToolbarSpacer,
    WorkflowNode: () => WorkflowNode,
    badgeVariants: () => badgeVariants,
    buttonVariants: () => buttonVariants
  });
  init_define_import_meta_env();

  // node_modules/@radix-ui/react-slot/dist/index.mjs
  init_define_import_meta_env();
  var React2 = __toESM(require_react_shim(), 1);

  // node_modules/@radix-ui/react-compose-refs/dist/index.mjs
  init_define_import_meta_env();
  var React = __toESM(require_react_shim(), 1);
  function setRef(ref, value) {
    if (typeof ref === "function") {
      return ref(value);
    } else if (ref !== null && ref !== void 0) {
      ref.current = value;
    }
  }
  function composeRefs(...refs) {
    return (node) => {
      let hasCleanup = false;
      const cleanups = refs.map((ref) => {
        const cleanup = setRef(ref, node);
        if (!hasCleanup && typeof cleanup == "function") {
          hasCleanup = true;
        }
        return cleanup;
      });
      if (hasCleanup) {
        return () => {
          for (let i = 0; i < cleanups.length; i++) {
            const cleanup = cleanups[i];
            if (typeof cleanup == "function") {
              cleanup();
            } else {
              setRef(refs[i], null);
            }
          }
        };
      }
    };
  }
  function useComposedRefs(...refs) {
    return React.useCallback(composeRefs(...refs), refs);
  }

  // node_modules/@radix-ui/react-slot/dist/index.mjs
  // @__NO_SIDE_EFFECTS__
  function createSlot(ownerName) {
    const Slot2 = React2.forwardRef((props, forwardedRef) => {
      let { children, ...slotProps } = props;
      let slottableElement = null;
      let hasSlottable = false;
      const newChildren = [];
      if (isLazyComponent(children) && typeof use === "function") {
        children = use(children._payload);
      }
      React2.Children.forEach(children, (maybeSlottable) => {
        if (isSlottable(maybeSlottable)) {
          hasSlottable = true;
          const slottable = maybeSlottable;
          let child = "child" in slottable.props ? slottable.props.child : slottable.props.children;
          if (isLazyComponent(child) && typeof use === "function") {
            child = use(child._payload);
          }
          slottableElement = getSlottableElementFromSlottable(slottable, child);
          newChildren.push(slottableElement?.props?.children);
        } else {
          newChildren.push(maybeSlottable);
        }
      });
      if (slottableElement) {
        slottableElement = React2.cloneElement(slottableElement, void 0, newChildren);
      } else if (
        // A `Slottable` was found but it didn't resolve to a single element (e.g.
        // it wrapped multiple elements, text, or a render-prop `child` that
        // wasn't an element). Don't fall back to treating the `Slottable` wrapper
        // itself as the slot target — throw a descriptive error below instead.
        !hasSlottable && React2.Children.count(children) === 1 && React2.isValidElement(children)
      ) {
        slottableElement = children;
      }
      const slottableElementRef = slottableElement ? getElementRef(slottableElement) : void 0;
      const composedRef = useComposedRefs(forwardedRef, slottableElementRef);
      if (!slottableElement) {
        if (children || children === 0) {
          throw new Error(
            hasSlottable ? createSlottableError(ownerName) : createSlotError(ownerName)
          );
        }
        return children;
      }
      const mergedProps = mergeProps(slotProps, slottableElement.props ?? {});
      if (slottableElement.type !== React2.Fragment) {
        mergedProps.ref = forwardedRef ? composedRef : slottableElementRef;
      }
      return React2.cloneElement(slottableElement, mergedProps);
    });
    Slot2.displayName = `${ownerName}.Slot`;
    return Slot2;
  }
  var Slot = /* @__PURE__ */ createSlot("Slot");
  var SLOTTABLE_IDENTIFIER = /* @__PURE__ */ Symbol.for("radix.slottable");
  var getSlottableElementFromSlottable = (slottable, child) => {
    if ("child" in slottable.props) {
      const child2 = slottable.props.child;
      if (!React2.isValidElement(child2)) return null;
      return React2.cloneElement(child2, void 0, slottable.props.children(child2.props.children));
    }
    return React2.isValidElement(child) ? child : null;
  };
  function mergeProps(slotProps, childProps) {
    const overrideProps = { ...childProps };
    for (const propName in childProps) {
      const slotPropValue = slotProps[propName];
      const childPropValue = childProps[propName];
      const isHandler = /^on[A-Z]/.test(propName);
      if (isHandler) {
        if (slotPropValue && childPropValue) {
          overrideProps[propName] = (...args) => {
            const result = childPropValue(...args);
            slotPropValue(...args);
            return result;
          };
        } else if (slotPropValue) {
          overrideProps[propName] = slotPropValue;
        }
      } else if (propName === "style") {
        overrideProps[propName] = { ...slotPropValue, ...childPropValue };
      } else if (propName === "className") {
        overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(" ");
      }
    }
    return { ...slotProps, ...overrideProps };
  }
  function getElementRef(element) {
    let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
    let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.ref;
    }
    getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
    mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
    if (mayWarn) {
      return element.props.ref;
    }
    return element.props.ref || element.ref;
  }
  function isSlottable(child) {
    return React2.isValidElement(child) && typeof child.type === "function" && "__radixId" in child.type && child.type.__radixId === SLOTTABLE_IDENTIFIER;
  }
  var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
  function isLazyComponent(element) {
    return element != null && typeof element === "object" && "$$typeof" in element && element.$$typeof === REACT_LAZY_TYPE && "_payload" in element && isPromiseLike(element._payload);
  }
  function isPromiseLike(value) {
    return typeof value === "object" && value !== null && "then" in value;
  }
  var createSlotError = (ownerName) => {
    return `${ownerName} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`;
  };
  var createSlottableError = (ownerName) => {
    return `${ownerName} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`;
  };
  var use = React2[" use ".trim().toString()];

  // node_modules/class-variance-authority/dist/index.mjs
  init_define_import_meta_env();

  // node_modules/clsx/dist/clsx.mjs
  init_define_import_meta_env();
  function r(e) {
    var t, f, n = "";
    if ("string" == typeof e || "number" == typeof e) n += e;
    else if ("object" == typeof e) if (Array.isArray(e)) {
      var o = e.length;
      for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
    } else for (f in e) e[f] && (n && (n += " "), n += f);
    return n;
  }
  function clsx() {
    for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
    return n;
  }

  // node_modules/class-variance-authority/dist/index.mjs
  var falsyToString = (value) => typeof value === "boolean" ? `${value}` : value === 0 ? "0" : value;
  var cx = clsx;
  var cva = (base, config) => (props) => {
    var _config_compoundVariants;
    if ((config === null || config === void 0 ? void 0 : config.variants) == null) return cx(base, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
    const { variants, defaultVariants } = config;
    const getVariantClassNames = Object.keys(variants).map((variant) => {
      const variantProp = props === null || props === void 0 ? void 0 : props[variant];
      const defaultVariantProp = defaultVariants === null || defaultVariants === void 0 ? void 0 : defaultVariants[variant];
      if (variantProp === null) return null;
      const variantKey = falsyToString(variantProp) || falsyToString(defaultVariantProp);
      return variants[variant][variantKey];
    });
    const propsWithoutUndefined = props && Object.entries(props).reduce((acc, param) => {
      let [key, value] = param;
      if (value === void 0) {
        return acc;
      }
      acc[key] = value;
      return acc;
    }, {});
    const getCompoundVariantClassNames = config === null || config === void 0 ? void 0 : (_config_compoundVariants = config.compoundVariants) === null || _config_compoundVariants === void 0 ? void 0 : _config_compoundVariants.reduce((acc, param) => {
      let { class: cvClass, className: cvClassName, ...compoundVariantOptions } = param;
      return Object.entries(compoundVariantOptions).every((param2) => {
        let [key, value] = param2;
        return Array.isArray(value) ? value.includes({
          ...defaultVariants,
          ...propsWithoutUndefined
        }[key]) : {
          ...defaultVariants,
          ...propsWithoutUndefined
        }[key] === value;
      }) ? [
        ...acc,
        cvClass,
        cvClassName
      ] : acc;
    }, []);
    return cx(base, getVariantClassNames, getCompoundVariantClassNames, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
  };

  // dist/index.js
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  function cn(...inputs) {
    return clsx(inputs);
  }
  var buttonVariants = cva("gtm-btn", {
    variants: {
      variant: {
        primary: "gtm-btn--primary",
        secondary: "gtm-btn--secondary",
        ghost: "gtm-btn--ghost",
        outline: "gtm-btn--outline"
      },
      size: {
        md: "gtm-btn--md",
        sm: "gtm-btn--sm",
        icon: "gtm-btn--icon"
      }
    },
    defaultVariants: { variant: "primary", size: "md" }
  });
  function Button({
    className,
    variant,
    size,
    asChild = false,
    ...props
  }) {
    const Comp = asChild ? Slot : "button";
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Comp, { className: cn(buttonVariants({ variant, size }), className), ...props });
  }
  function Card({ className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("gtm-card", className), ...props });
  }
  function CardHeader({ className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("gtm-card__header", className), ...props });
  }
  function CardTitle({ className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: cn("gtm-card__title", className), ...props });
  }
  function CardDescription({ className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: cn("gtm-card__description", className), ...props });
  }
  function CardContent({ className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("gtm-card__content", className), ...props });
  }
  var badgeVariants = cva("gtm-badge", {
    variants: {
      tone: {
        proven: "gtm-badge--proven",
        gap: "gtm-badge--gap",
        danger: "gtm-badge--danger",
        blind: "gtm-badge--blind",
        neutral: "gtm-badge--neutral",
        agent: "gtm-badge--agent"
      },
      /** Uppercase, tracked treatment — the "PROVEN / GAP / BLIND" state mark. */
      caps: { true: "gtm-badge--caps", false: "" }
    },
    defaultVariants: { tone: "neutral", caps: false }
  });
  function Badge({ className, tone, caps, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn(badgeVariants({ tone, caps }), className), ...props });
  }
  function Input({ className, mono, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { className: cn("gtm-input", mono && "gtm-input--mono", className), ...props });
  }
  function Textarea({ className, mono, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "textarea",
      {
        className: cn("gtm-textarea", mono && "gtm-textarea--mono", className),
        ...props
      }
    );
  }
  function SegmentedTabs({
    items,
    value,
    onValueChange,
    className,
    ...props
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("gtm-tabs", className), role: "tablist", ...props, children: items.map((item) => {
      const active = item.value === value;
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": active,
          className: cn("gtm-tab", active && "gtm-tab--active"),
          onClick: () => onValueChange?.(item.value),
          children: [
            item.icon,
            item.label
          ]
        },
        item.value
      );
    }) });
  }
  function StatusDot({ tone = "blind", className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("gtm-dot", `gtm-dot--${tone}`, className), ...props });
  }
  function SectionHeading({
    icon,
    children,
    className,
    ...props
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-section-heading", className), ...props, children: [
      icon,
      children
    ] });
  }
  var CATEGORY_LABEL = {
    source: "Source",
    enrich: "Enrich",
    filter: "Filter",
    generate: "Generate",
    gate: "Gate",
    execute: "Execute",
    measure: "Measure"
  };
  function categoryAccent(category) {
    return `var(--cat-${category})`;
  }
  function isAutoRunOff(value) {
    return value === false || value === "disabled";
  }
  function isAutoRunBuiltin(value) {
    return value === true || value === false || value === "enabled" || value === "disabled";
  }
  function renderAutoRunValue(value) {
    if (!isAutoRunBuiltin(value)) return value;
    return isAutoRunOff(value) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__meta-off", children: "Disabled" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__meta-on", children: "Enabled" });
  }
  function isFreeCost(value) {
    return typeof value === "string" && value.trim().toLowerCase() === "free";
  }
  function isScalarCost(value) {
    return typeof value === "number" || typeof value === "string";
  }
  function renderCostValue(value) {
    if (isFreeCost(value)) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__meta-free", children: "Free" });
    if (!isScalarCost(value)) return value;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gtm-node__cost", children: [
      value,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": true, className: "gtm-node__coin" })
    ] });
  }
  function WorkflowNode({
    category,
    label,
    icon,
    connector,
    status,
    count,
    error,
    selected,
    rich,
    autoRun,
    cost,
    fields,
    gear,
    className,
    style,
    ...props
  }) {
    const isRich = rich === true || autoRun != null || cost != null || fields != null;
    const accentStyle = {
      ["--node-accent"]: categoryAccent(category),
      ...style
    };
    if (!isRich) {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          className: cn(
            "gtm-node",
            `gtm-node--${category}`,
            selected && "gtm-node--selected",
            error && "gtm-node--error",
            className
          ),
          style: accentStyle,
          ...props,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gtm-node__header", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__icon", children: icon }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gtm-node__header-right", children: [
                connector != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__connector", children: connector }) : null,
                status != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__status", children: status }) : null
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__category", children: CATEGORY_LABEL[category] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__label", children: label }),
            count != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__count", children: count }) : null,
            error != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__error-text", children: error }) : null
          ]
        }
      );
    }
    const hasMeta = autoRun != null || cost != null || fields != null;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: cn(
          "gtm-node",
          "gtm-node--rich",
          `gtm-node--${category}`,
          selected && "gtm-node--selected",
          error && "gtm-node--error",
          className
        ),
        style: accentStyle,
        ...props,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gtm-node__top", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__chip", children: icon }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__title", children: label }),
            connector != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__connector", children: connector }) : null,
            status != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__status", children: status }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__gear", children: gear })
          ] }),
          hasMeta ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__rule" }) : null,
          hasMeta ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gtm-node__meta", children: [
            autoRun != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gtm-node__meta-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__meta-key", children: "Auto-Run" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__meta-val", children: renderAutoRunValue(autoRun) })
            ] }) : null,
            cost != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gtm-node__meta-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__meta-key", children: "Cost" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__meta-val", children: renderCostValue(cost) })
            ] }) : null,
            fields != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gtm-node__meta-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__meta-key", children: "Mapped fields" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__meta-val gtm-node__meta-strong", children: fields })
            ] }) : null
          ] }) : null,
          error != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-node__error-text", children: error }) : null
        ]
      }
    );
  }
  function CitationCard({
    path,
    icon,
    code,
    className,
    children,
    ...props
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-citation", className), ...props, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-citation__location", children: [
        icon,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-citation__path", children: path })
      ] }),
      code != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { className: "gtm-citation__code", children: code }) : null,
      children
    ] });
  }
  function ProspectCard({
    name,
    score,
    scoreTone = "proven",
    summary,
    draft,
    draftLabel = "Draft",
    draftAction,
    icon,
    className,
    ...props
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-prospect", className), ...props, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-prospect__header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "gtm-prospect__name", children: [
          icon,
          name
        ] }),
        score != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { tone: scoreTone, className: "gtm-prospect__score", children: score }) : null
      ] }),
      summary != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gtm-prospect__summary", children: summary }) : null,
      draft != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-prospect__draft", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-prospect__draft-header", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: draftLabel }),
          draftAction
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "gtm-prospect__draft-body", children: draft })
      ] }) : null
    ] });
  }
  function MediaCard({
    cover,
    coverContent,
    title,
    meta,
    footer,
    className,
    children,
    ...props
  }) {
    const footerAtoms = footer ?? children;
    const coverIsBackground = typeof cover === "string";
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-media-card", className), ...props, children: [
      cover != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "gtm-media-card__cover",
          style: coverIsBackground ? { background: cover } : void 0,
          children: coverIsBackground ? coverContent : cover
        }
      ) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-media-card__body", children: [
        title != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gtm-media-card__title", children: title }) : null,
        meta != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gtm-media-card__meta", children: meta }) : null,
        footerAtoms != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gtm-media-card__footer", children: footerAtoms }) : null
      ] })
    ] });
  }
  var TONE_VAR = {
    source: "var(--cat-source)",
    enrich: "var(--cat-enrich)",
    filter: "var(--cat-filter)",
    generate: "var(--cat-generate)",
    gate: "var(--cat-gate)",
    execute: "var(--cat-execute)",
    measure: "var(--cat-measure)",
    proven: "var(--proven)",
    gap: "var(--gap)",
    danger: "var(--danger)",
    blind: "var(--blind)",
    agent: "var(--agent)",
    link: "var(--link)",
    ink: "var(--st-ink)"
  };
  function resolveTone(tone) {
    return TONE_VAR[tone] ?? tone;
  }
  function IconChip({ tone = "ink", icon, className, style, ...props }) {
    const chipStyle = { ...style, "--chip-tone": resolveTone(tone) };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("gtm-chip", className), style: chipStyle, ...props, children: icon });
  }
  function MetaPill({ icon, label, accent, className, style, ...props }) {
    const pillStyle = {
      ...style,
      ...accent != null ? { "--pill-accent": resolveTone(accent) } : null
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "span",
      {
        className: cn("gtm-meta-pill", accent != null && "gtm-meta-pill--accent", className),
        style: pillStyle,
        ...props,
        children: [
          icon != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-meta-pill__icon", children: icon }) : null,
          label
        ]
      }
    );
  }
  function Toolbar({ className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("gtm-toolbar", className), ...props });
  }
  function Brand({ mark, children, className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-brand", className), ...props, children: [
      mark != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-brand-mark", children: mark }) : null,
      children
    ] });
  }
  function ToolbarDivider({ className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("gtm-toolbar__divider", className), ...props });
  }
  function ToolbarSpacer({ className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("gtm-toolbar__spacer", className), ...props });
  }
  function Chat({ header, composer, children, className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-chat", className), ...props, children: [
      header,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gtm-chat__body", children }),
      composer
    ] });
  }
  function ChatHeader({ title, actions, className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-chat__header", className), ...props, children: [
      actions,
      title != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-chat__title", children: title }) : null
    ] });
  }
  function ChatIconButton({ icon, type = "button", className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type, className: cn("gtm-chat__icon-btn", className), ...props, children: icon });
  }
  var ATTACHMENT_SKELETON = [88, 100, 100, 70, 94];
  function ChatAttachment({
    name,
    meta,
    icon,
    tone = "danger",
    preview,
    className,
    ...props
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-chat__attach", className), ...props, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-chat__attach-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("gtm-chat__file-badge", `gtm-chat__file-badge--${tone}`), children: icon }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-chat__attach-meta", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gtm-chat__attach-name", children: name }),
          meta != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gtm-chat__attach-sub", children: meta }) : null
        ] })
      ] }),
      preview === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-chat__attach-preview", "aria-hidden": "true", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gtm-chat__skel gtm-chat__skel--title" }),
        ATTACHMENT_SKELETON.map((w, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gtm-chat__skel", style: { width: `${w}%` } }, i))
      ] }) : preview
    ] });
  }
  function ChatMessage({
    role = "assistant",
    avatar,
    actions,
    children,
    className,
    ...props
  }) {
    if (role === "user") {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("gtm-chat__msg gtm-chat__msg--user", className), ...props, children });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-chat__msg gtm-chat__msg--assistant", className), ...props, children: [
      avatar != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-chat__avatar", children: avatar }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-chat__msg-stack", children: [
        children,
        actions != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gtm-chat__msg-actions", children: actions }) : null
      ] })
    ] });
  }
  function ChatReply({ className, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("gtm-chat__reply", className), ...props });
  }
  function ChatToolCall({
    icon,
    trailing,
    tone = "danger",
    children,
    className,
    ...props
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-chat__chip gtm-chat__chip--tool", className), ...props, children: [
      icon != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("gtm-chat__chip-icon", `gtm-chat__chip-icon--${tone}`), children: icon }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-chat__chip-label", children }),
      trailing != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-chat__chip-trail", children: trailing }) : null
    ] });
  }
  function ChatDocRef({
    icon,
    tone = "generate",
    children,
    className,
    ...props
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: cn("gtm-chat__chip gtm-chat__chip--doc", className), ...props, children: [
      icon != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("gtm-chat__chip-icon", `gtm-chat__chip-icon--${tone}`), children: icon }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-chat__doc-title", children })
    ] });
  }
  function ChatPill({
    icon,
    trailing,
    variant = "outline",
    type = "button",
    children,
    className,
    ...props
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type,
        className: cn("gtm-chat__pill", `gtm-chat__pill--${variant}`, className),
        ...props,
        children: [
          icon != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-chat__pill-icon", children: icon }) : null,
          children,
          trailing != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-chat__pill-trail", children: trailing }) : null
        ]
      }
    );
  }
  function ChatComposer({
    input,
    placeholder = "Ask anything",
    plusIcon,
    micIcon,
    sendIcon,
    onSend,
    sendDisabled = false,
    controls,
    className,
    ...props
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("gtm-chat__composer", className), ...props, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-chat__field", children: [
      input ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "gtm-chat__placeholder", children: placeholder }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "gtm-chat__rail", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "gtm-chat__plus", "aria-label": "Add attachment", children: plusIcon }),
        controls,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "gtm-chat__rail-spacer" }),
        micIcon != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "gtm-chat__mic", "aria-label": "Dictate", children: micIcon }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "gtm-chat__send",
            "aria-label": "Send",
            onClick: onSend,
            disabled: sendDisabled,
            children: sendIcon
          }
        )
      ] })
    ] }) });
  }
  return __toCommonJS(index_exports);
})();
window.GtmIde=GtmIde.__dsMainNs?Object.assign({},GtmIde,GtmIde.__dsMainNs,{__dsMainNs:undefined}):GtmIde;
