import { ServiceContainer } from "@/src/core/container/service-container";

export function createAppContainer() {
	return new ServiceContainer();
}
