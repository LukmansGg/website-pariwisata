import { createServiceToken } from "@/src/core/container/service-container";
import type { TourismService } from "./tourism.types";

export const TOURISM_SERVICE = createServiceToken<TourismService>("tourism");
