/* Color Eights — post-processing + image-based-lighting addons (three r160, vendored under
 * vendor/three/addons/ and resolved through the importmap). Exposes window.CEPost for render.js.
 * bootstrap.js loads this optionally: if it fails, the game renders without post-processing. */
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.CEPost = { EffectComposer, RenderPass, ShaderPass, OutputPass, GTAOPass, UnrealBloomPass, SMAAPass, FXAAShader, RoomEnvironment };
