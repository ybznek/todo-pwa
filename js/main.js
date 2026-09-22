import { TodoApp } from "./ui/app.js";
import { TimerEngine } from "./timer/engine.js";

const timer = new TimerEngine();
const app = new TodoApp(timer);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(console.error);
}

app.init().catch(console.error);
