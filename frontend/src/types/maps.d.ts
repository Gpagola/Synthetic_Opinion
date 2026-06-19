declare module "es-atlas/es/autonomous_regions.json" {
  const topology: any;
  export default topology;
}

declare module "d3-composite-projections" {
  import { GeoProjection } from "d3-geo";
  interface CompositeProjection extends GeoProjection {
    getCompositionBorders(): string;
  }
  export function geoConicConformalSpain(): CompositeProjection;
}
