import { describe, expect, it, vi } from "vitest";
import { relayHorizontalWheelScroll } from "@/utils/horizontal-wheel-scroll";

describe("relayHorizontalWheelScroll", () => {
	it("relays trackpad horizontal delta to the container", () => {
		const container = { scrollLeft: 40 } as HTMLElement;
		const preventDefault = vi.fn();

		const handled = relayHorizontalWheelScroll(
			{
				deltaX: 25,
				deltaY: 0,
				shiftKey: false,
				preventDefault,
			},
			container,
		);

		expect(handled).toBe(true);
		expect(container.scrollLeft).toBe(65);
		expect(preventDefault).toHaveBeenCalledTimes(1);
	});

	it("treats shift plus vertical wheel as horizontal scrolling", () => {
		const container = { scrollLeft: 10 } as HTMLElement;
		const preventDefault = vi.fn();

		const handled = relayHorizontalWheelScroll(
			{
				deltaX: 0,
				deltaY: 18,
				shiftKey: true,
				preventDefault,
			},
			container,
		);

		expect(handled).toBe(true);
		expect(container.scrollLeft).toBe(28);
		expect(preventDefault).toHaveBeenCalledTimes(1);
	});

	it("ignores plain vertical wheel events", () => {
		const container = { scrollLeft: 10 } as HTMLElement;
		const preventDefault = vi.fn();

		const handled = relayHorizontalWheelScroll(
			{
				deltaX: 0,
				deltaY: 18,
				shiftKey: false,
				preventDefault,
			},
			container,
		);

		expect(handled).toBe(false);
		expect(container.scrollLeft).toBe(10);
		expect(preventDefault).not.toHaveBeenCalled();
	});
});
