export type Point = {
  id: string;
  lat: number;
  lng: number;
  name: string;
};

export type InteractionMode = 'add_light' | 'set_start' | 'none';
