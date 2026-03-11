export type Point = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  heading?: number;
};

export type InteractionMode = 'add_light' | 'set_start' | 'none' | 'navigating';
