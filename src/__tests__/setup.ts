import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";

GlobalRegistrator.register();

const testingLibraryPath: string = "@testing-library/react";
const { cleanup } = await import(testingLibraryPath);
const jestDomPath: string = "@testing-library/jest-dom";
await import(jestDomPath);

afterEach(() => cleanup());
