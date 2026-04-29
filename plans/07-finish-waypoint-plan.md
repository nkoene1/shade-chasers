# 07 — Finish Waypoint And Minimap Icon Plan

## Goal

Clarify the finish/shelter location without adding any tall world-space object that could affect shadows or block the sun.

## Scope

- Add one shared shelter/home SVG icon component.
- Add an always-visible HTML HUD waypoint that tracks the finish position on screen.
- Add an always-visible minimap icon for the finish position.
- Keep the existing finish world landmark unchanged.

## Implementation

1. Create a small shared `ShelterIcon` React component that renders an inline SVG. Use this in both the HUD waypoint and the minimap marker.
2. Add scene-side tracking that projects the finish area world position into screen coordinates each frame with `Vector3.project(camera)`.
3. Compute whether the player is looking toward the finish using the camera center ray and the finish disk radius. Store this as a waypoint focus value.
4. Add a HUD waypoint element whose pixel position comes from the projected vector. Apply that pixel position with `transform: translate3d(...)`. Keep it visible at all times, with opacity `1` when the player is looking at the finish and `0.4` otherwise.
5. Add a minimap DOM marker positioned from finish world coordinates into the minimap square, independent of camera direction, so it is always visible.
6. Style both elements to match the existing scorched HUD language while using cyan/blue shelter coloring to connect them to the finish area.

## Verification

- Run the TypeScript/build check.
- Manually verify the waypoint follows the finish marker, fades between focused/unfocused states, and the minimap icon remains visible.

