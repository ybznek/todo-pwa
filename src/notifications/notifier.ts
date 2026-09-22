const ICON = "/icons/icon.svg";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

export async function showAppNotification(title: string, body: string): Promise<void> {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== "granted") return;

  const options: NotificationOptions = {
    body,
    icon: ICON,
    badge: ICON,
    tag: "todo-pwa-timer",
  };

  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return;
    } catch {
      // Fallback to page Notification API.
    }
  }

  new Notification(title, options);
}
