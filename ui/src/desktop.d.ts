type DroverRepositorySelection = {
  path: string;
  name: string;
};

type DroverDesktopBridge = {
  selectRepository: () => Promise<DroverRepositorySelection | null>;
};

interface Window {
  droverDesktop?: DroverDesktopBridge;
}
