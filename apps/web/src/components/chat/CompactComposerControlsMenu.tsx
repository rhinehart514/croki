import { RuntimeMode } from "@croki/contracts";
import { memo } from "react";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";

const runtimePresentation = {
  "approval-required": "Supervised",
  "auto-accept-edits": "Auto-accept",
  auto: "Auto",
  "full-access": "Full access",
} satisfies Record<RuntimeMode, string>;

export const CompactComposerControlsMenu = memo(function CompactComposerControlsMenu(props: {
  runtimeMode: RuntimeMode;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1.5 bg-transparent! px-1.5 text-muted-foreground/60 transition-colors duration-150 hover:bg-transparent! hover:text-foreground/80 motion-reduce:transition-none"
            aria-label="Access"
          />
        }
      >
        <span aria-hidden="true" className="opacity-45">
          ·
        </span>
        <span>{runtimePresentation[props.runtimeMode]}</span>
      </MenuTrigger>
      <MenuPopup
        align="start"
        className="translate-y-0 transition-[opacity,translate] duration-100 ease-out data-ending-style:translate-y-0.5 data-ending-style:opacity-0 data-starting-style:translate-y-0.5 data-starting-style:opacity-0 motion-reduce:transition-none"
      >
        <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Access</div>
        <MenuRadioGroup
          value={props.runtimeMode}
          onValueChange={(value) => {
            if (!value || value === props.runtimeMode) return;
            props.onRuntimeModeChange(value as RuntimeMode);
          }}
        >
          <MenuRadioItem
            value="approval-required"
            className="transition-colors duration-100 motion-reduce:transition-none"
          >
            Supervised
          </MenuRadioItem>
          <MenuRadioItem
            value="auto-accept-edits"
            className="transition-colors duration-100 motion-reduce:transition-none"
          >
            Auto-accept edits
          </MenuRadioItem>
          <MenuRadioItem
            value="auto"
            className="transition-colors duration-100 motion-reduce:transition-none"
          >
            Auto
          </MenuRadioItem>
          <MenuRadioItem
            value="full-access"
            className="transition-colors duration-100 motion-reduce:transition-none"
          >
            Full access
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
});
