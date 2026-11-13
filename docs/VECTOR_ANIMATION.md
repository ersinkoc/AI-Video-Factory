# Vector animation

[Documentation](README.md) · [Project home](../README.md)

Character motion, staging and camera behavior in vector episodes. For the implemented Three.js/PixiJS contract
and the HyperFrames development fixture, see [Scene motion and rendering engines](SCENE_MOTION.md).

## Rig, gestures and speech

Characters are puppets on a rig, moved entirely in code: things on the floor never float, walk steps follow
the distance travelled, held objects stay in the hand, and a character appears only once per shot. Gestures
have anticipation and overshoot; pointing aims at its target, and when the object is within reach the elbow
bends so the fingertip stops at its edge instead of covering it, eyes follow the listener, and explaining uses
one dominant hand. Mouths speak the narration: every sound gets its own mouth shape (lips closed on m, b and
p, wide on a, round on o, pursed on u, teeth on the lip for f and v), drawn in code where each drawing's mouth
was measured.

Reactions open the mouth too: a round "o" when someone is startled, wide open when they cheer, and a startled
person leans back with a hand on the chest and the other raised palm out toward whatever startled them.
Eyebrows carry the emotion: each drawing's own brows are split into left and right and tilted in code, inner
ends raised when worried or sad, lowered and drawn together when angry, one brow arched while thinking. A
worried, sad or angry face also gets a coded mouth with its corners turned down, since the drawings' own
mouths are a slight smile. The head nods, the brows lift and the hands stroke on the stressed words of each
sentence.

Word timings are aligned to the pauses in the recorded voice, so captions, lips and gestures stop where the
narrator pauses. Hands turn at the wrist when an arm reaches out sideways, so the thumb stays on top instead
of pointing at the floor. Faces turn like a real head: when the eyes look to one side the nose moves with
them, so the eyes never run into the nose and glasses stay on it; the eyes and mouth never slide past the
outline of the face, and on a narrow face, where the eyes are drawn close to its edge, the pupils move inside
the eyes instead; and the neck sits behind the collar instead of on top of the clothes. A thinking character
takes one of three poses per shot: the chin resting on the hand in front of the face (the elbow propped on the
other hand, the fingers kept below the mouth), scratching the side of the head, or arms crossed with the head
tilted and the eyes up.

Characters also act out what the narration says: typing at a keyboard, writing, reading a page, holding an
object up to show it, clapping, hands on hips, arms crossed, handing an object to someone, nodding yes,
shaking the head no, shrugging, cheering, waving, recoiling in surprise and pondering (when the director
planned only a generic gesture, the action the shot's description narrates is given to that person in code,
unless the render cannot stage it), and the face shows the emotion the description gives that person (worried,
sad, angry, surprised, happy, thoughtful) even if the director chose another; clapping, key taps and pen
strokes are heard in sync with the hands.

A hand that points at or gestures toward the person beside it stops halfway between them, so two hands never
meet in mid-air. Characters turn to the person they are with instead of staring at the camera: a listener
turns toward the speaker, the speaker half way; 3D figures really turn. Standing characters rest their weight
on one leg and shift it now and then, and listeners take a relaxed pose of their own (a hand on the hip, hands
together in front) instead of standing in an identical row with arms hanging. A listener's mood shows in the
body too: a worried one wrings their hands, an angry one crosses their arms, a sad one slumps. Optional side
views let walking characters turn to profile.

## Staging, sets and screen content

A room used in many shots gets its reverse angle drawn once (the opposite wall of the same place, checked
against the first view), and consecutive shots in that room cut between the two angles instead of showing the
same wall again. Every place also gets up to two large pieces of furniture that really stood there at that
time (a bookcase, a cabinet, a tall plant), chosen by a cheap agent and drawn once from references like every
object; in wide and medium shots code stands them at the back of the room, behind the action, so a room no
longer shows a bare wall behind one person. A piece keeps its spot from shot to shot, the reverse angle shows
the other wall, it never covers a board or a window, and the camera frames the shot as if it were not there.

Screens and boards show what the shot is about: the director writes what a monitor, laptop, TV, phone, giant
screen or blackboard shows (code with syntax colours, a command line, a web page, a search, a chat, a headline
or a person's face), and code draws it on the drawing's own screen, so the same computer shows something new
in every shot. Screen text wraps and stays at a readable size in the frame; on a small screen a chat keeps its
newest messages. Characters speak and think in comic bubbles: the director writes the words, code draws the
bubble beside the head with its tail pointing to the mouth and ending at the edge of the head, clear of faces
and titles.

## Close-ups and readable details

Close-ups reframe themselves when the subject would stay tiny, and a camera moving in on an object keeps
everyone the director had in frame (a close-up of the laptop no longer drops the person working at it). A
small key object in a wide shot (a page, a screen, a chip) is shown magnified in a round inset with a pointer,
placed where it covers no face, body or text, with its pointer kept off faces and bodies, and kept there for
the whole shot (furniture such as a desk never gets one); the inset opens only once its object has appeared,
and not at all if every spot would cover a person. When the director's close-up is aimed at a small object
that still cannot reach a readable size (a chip, a cheque, a stamp, a gavel), the shot becomes a macro insert:
once the object is in place, the scene behind it softens and darkens (people stay recognisable) and the object
grows to the middle of the frame, screen content included, standing on a magnified strip of the desk or table
it rests on.

A close-up aimed at the person gets the inset instead when the object stays small because the head has to stay
in frame. For a screen (a laptop page, a chat, code) what counts is whether the text on it can be read: the
inset then shows the screen itself, magnified, rather than the whole device.

## Lighting and composition

The camera behaves like a lens: as it moves in, focus stays on the subject while the wall, the extras and
people far in front of or behind it go soft (depth of field; wide shots stay sharp everywhere, anyone talking
stays sharp, and so does any text the shot is about), screens glow slightly, and the frame drifts by a pixel
or two like a camera on a tripod instead of standing perfectly frozen. It adds no measurable render time.
Light falls into the room from one side: the side of its window or lamp, found in the room's own drawing (the
brightest mid-sized shapes), or a fixed side per room when none stands out; the reverse angle of a room is lit
from the other side.

Each shot knows the object it is about (named by the director, or taken from the shot description): objects
keep their real size, so when that object is too small to read the camera moves in on it, with everyone's head
still in frame and near the top, before an inset is needed. An object shown in the air beside a person is
never drawn smaller than a hand-held one. Name tags sit right on the drawn head, and a real person is named
where they first appear in the episode (scenes are planned separately, so code puts the tag there, in the
spelling the director used elsewhere), the info card moves to the other upper corner when a person is under
it, people on one bench sit side by side, two people standing in a wide shot come to talking distance (about
1.1 m) instead of staying at opposite ends of the room, stopping at the edges of a desk or board between them,
three or more standing in a row form a slight arc open to the camera (the ends a step forward, the middle a
step back) instead of a police line-up, and a person in front steps aside instead of hiding a face behind
them; an object the director placed half outside the picture (a horse, a cannon, a pile of sacks) is moved
back in, with whatever stands on it; someone standing right behind a low table steps beside it, since with the
feet hidden they looked as if standing on it; someone short behind a counter rises so their head and shoulders
show above it, clear of the sign's pole; a monitor on a desk slides along it so it does not hide the face of
the person behind.

The camera never cuts a standing person at the ankles, shins or knees, in close-ups too: either the feet are
in frame or the cut is at mid-thigh or higher; if moving the frame is not enough, it zooms a little in or out.
A wide shot with a lot of bare wall and floor moves in to a medium shot; a tall machine or cabinet beside the
people may lose a little of its base for it, small objects stay whole, and a chart, clock or sign on the wall
is not left cut at the frame edge. A close-up of a person frames them from the waist up with a little headroom
(a director's zoom of 1.5–2 used to show a small full figure under an empty wall), and 3D figures are drawn at
screen resolution so close-ups stay sharp.

When two shots in a row show the same people in the same room at the same size, the second one changes size
(wide, medium, close) so the cut does not look like a jump. Confetti, sparks and dust fall behind the
characters; fog thickens with distance, hazing the room behind the people while only a thin ground mist drifts
in front of them; nothing covers the on-screen text.

## Crowds and physical actions

Cheering fists pump at head height with bent elbows, each person in their own rhythm, clapping palms meet at
the middle of the chest, typing hands rest on the two halves of the keyboard and tap, and the writing hand
moves along the line while the other holds the paper. Scenes with more people than the cast (an army, an
audience, protesters, a market) get extras drawn by code in rows behind the cast: anonymous people in casual
clothes, suits, uniforms or robes, drawn at the cast's proportions with bending arms, fists and faces that
shout or smile, who stand (some with hands on hips), listen (some with arms crossed), cheer, applaud, protest
(each raising one fist, the other or both) or march forward, without covering anything behind them.

They are heard too: applause, cheers, a murmur, chants as the fists go up and footsteps in step with the
march. A person typing or writing stands behind their desk (a chair beside the desk slides behind it with its
sitter), and their hands go to its real height: up onto a high counter, onto the desktop when sitting, down to
a low table. Someone writing on a whiteboard, blackboard or flip chart stands at its edge rather than in front
of the writing, and the pen moves along a line inside the board while the head turns to it.

## Joint limits and pre-render checks

No pose goes beyond what a human body can do: joint limits come from clinical range-of-motion tables (the
elbow bends at most 150°, measured in 3D with foreshortened limbs reconstructed; the knee never bends
sideways; the shoulder crosses the body only as far as it can), render clamps anything beyond them, and a test
sweeps every gesture, every pair of gestures, and sitting, holding, mirrored and walking poses. 3D figures
turn a foreshortened forearm or thigh toward the camera instead of squashing it. Before render every shot is
checked in code: a half face at the frame edge, a face hidden behind furniture, text over a face, people
walking through each other, a hand pointing at nothing, typing away from the desk, a prop that could not be
drawn, an empty frame, a joint that jumps between frames, a joint bent past its human limit.

What can be fixed without losing meaning is fixed at render: a person steps up to the desk or out from behind
the counter, picks up the nearby book to read it, a walker passes in front of someone instead of through them,
a cheer lasts a few seconds instead of the whole shot, and the camera keeps every still face fully in or fully
out of frame; a rocket, warship or fortress far taller than the frame is shown whole, as if seen from a
distance, instead of as a strip of its base; an object that would show only a thin strip at the side of the
frame is brought further in or left out. Scenes that would still show a defect are replanned by the director.
