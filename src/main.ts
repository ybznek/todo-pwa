import { TodoApp } from "./ui/app";
import { TimerEngine } from "./timer/engine";
import "./style.css";

const timer = new TimerEngine();
const app = new TodoApp(timer);

void app.init();
