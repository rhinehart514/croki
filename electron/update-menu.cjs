// Add one native update action without replacing Electron's platform-standard Edit/Window menus.

function installUpdateMenu({ app, Menu, MenuItem, checker, developmentIdentity = null, platform = process.platform } = {}) {
  if (platform !== "darwin") return null;
  const applicationMenu = Menu.getApplicationMenu();
  const applicationSubmenu = applicationMenu?.items?.[0]?.submenu;
  if (!applicationSubmenu || applicationSubmenu.items.some((item) => item.id === "croki-update")) return null;
  const posture = checker.status();
  const item = new MenuItem({
    id: "croki-update",
    label: posture.channel === "production"
      ? "Check for Updates…"
      : developmentIdentity?.label ?? `Development Build · ${app.getVersion()}`,
    enabled: posture.canCheck,
    click: async () => {
      item.enabled = false;
      try {
        await checker.check({ interactive: true });
      } finally {
        item.enabled = checker.status().canCheck;
      }
    },
  });
  applicationSubmenu.insert(1, item);
  return item;
}

module.exports = { installUpdateMenu };
