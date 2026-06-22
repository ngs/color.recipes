// Unit-project setup: unmount rendered components between tests.
import { cleanup } from "@testing-library/preact";
import { afterEach } from "vitest";

afterEach(() => cleanup());
