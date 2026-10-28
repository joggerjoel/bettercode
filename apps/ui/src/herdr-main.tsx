import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { HerdrSeat } from "./herdr-seat"
import "./index.css"

const root = document.getElementById("root")
if (!root) throw new Error("Herdr seat root is missing")
document.documentElement.classList.add("dark")
createRoot(root).render(<StrictMode><HerdrSeat /></StrictMode>)
