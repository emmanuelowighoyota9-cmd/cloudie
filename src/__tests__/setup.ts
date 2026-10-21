import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";

GlobalRegistrator.register();

const { cleanup } = await import("@testing-library/react");
await import("@testing-library/jest-dom");

afterEach(() => cleanup());
