import { View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { SettingsLegalDocumentRouteScreen } from "./components/SettingsLegalDocumentRouteScreen";
import { LEGAL_URL } from "./lib/legal-document-url";

export function SettingsLegalRouteScreen() {
  if (LEGAL_URL === null) {
    return (
      <View className="flex-1 items-center justify-center bg-sheet px-8">
        <Text className="text-center text-base text-foreground-muted">
          Legal documents are not configured for this build.
        </Text>
      </View>
    );
  }
  return <SettingsLegalDocumentRouteScreen documentName="Legal" documentUrl={LEGAL_URL} />;
}
