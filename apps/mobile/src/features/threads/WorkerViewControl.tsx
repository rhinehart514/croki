import type { WorkerView } from "@croki/contracts";
import type { MenuAction } from "@react-native-menu/menu";
import { useMemo } from "react";

import { ControlPill, ControlPillMenu } from "../../components/ControlPill";

export function WorkerViewControl(props: {
  readonly value: WorkerView;
  readonly onChange: (value: WorkerView) => void;
}) {
  const actions = useMemo<MenuAction[]>(
    () => [
      {
        id: "threads",
        title: "Separate chats",
        state: props.value === "threads" ? "on" : "off",
      },
      {
        id: "activity",
        title: "In Thread",
        state: props.value === "activity" ? "on" : "off",
      },
    ],
    [props.value],
  );

  return (
    <ControlPillMenu
      actions={actions}
      title="Workers"
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === "threads" || nativeEvent.event === "activity") {
          props.onChange(nativeEvent.event);
        }
      }}
    >
      <ControlPill
        accessibilityLabel={`Workers, ${props.value === "threads" ? "Separate chats" : "In Thread"}`}
        icon="person.crop.circle"
      />
    </ControlPillMenu>
  );
}
