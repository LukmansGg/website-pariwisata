export interface Destination {
  id: string;
  slug: string;
  name: string;
  description: string;
  isPublished: boolean;
}

export interface TourismService {
  getById(id: string): Promise<Destination | null>;
  getBySlug(slug: string): Promise<Destination | null>;
  listPublished(): Promise<Destination[]>;
}