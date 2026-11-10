/**
 * How to draw in 3D, for every agent that writes scenes (Studio's own and Claude Desktop).
 * It lives here rather than in a project's CLAUDE.md so existing projects get it too.
 */
export const threeDBrief = [
  '3D: when depth carries the idea (surfaces z = f(x, y), vectors, lines and planes in space, solids of revolution, fields, rotations, mechanisms), declare the scene as `class Video(StudioScene, ThreeDScene)` and use manim\'s 3D objects (ThreeDAxes, Surface, Sphere, Cylinder, Cone, Prism, Arrow3D, Line3D, Dot3D). Stay in 2D when a flat picture explains it as well.',
  'Set the view with self.set_camera_orientation(phi=…, theta=…, zoom=…). Move it with self.move_camera(...) or begin_ambient_camera_rotation(rate=0.2 to 0.5) and stop_ambient_camera_rotation(); move slowly and hold still while the narration explains.',
  'Pin titles, formulas and readouts to the screen: self.add_fixed_in_frame_mobjects(m), then self.remove(m), then Write or FadeIn it. A label that belongs to a point in space can face the camera with self.add_fixed_orientation_mobjects(m).',
  'Shaded surfaces are slow to draw: keep Surface resolution around 16 to 24 per side.',
  'In 3D, layout warnings measure what the camera shows, but depth can still hide things behind each other: look at view_frames from more than one moment of a camera move.',
].join(' ')
