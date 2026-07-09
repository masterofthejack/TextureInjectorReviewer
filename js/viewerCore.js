window.createTruckViewer = async function (engine, canvas) {
    let animState = new Map(); // animationGroup -> wasPlaying


    // ---------------- SCENE ----------------
    const scene = new BABYLON.Scene(engine);

//     // ---------------- SSAO2 ----------------
// const ssao = new BABYLON.SSAO2RenderingPipeline(
//   "ssao2",
//   scene,
//   {
//     ssaoRatio: 0.5,     // half-res AO for speed
//     blurRatio: 0.5
//   }
// );

// // tweak strength
// ssao.totalStrength = 1.2;   // overall AO intensity
// ssao.base = 0.5;            // how much ambient light remains
// ssao.radius = 0.15;         // AO radius in world units
// ssao.samples = 16;          // quality (8–32)
// ssao.maxZ = 24;             // depth cutoff

// // enable it
// scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
//   "ssao2",
//   camera
// );

    scene.clearColor = new BABYLON.Color4(0.5, 0.5, 0.55, 1);

    // ---------------- CAMERA ----------------
    const camera = new BABYLON.ArcRotateCamera(
        "cam",
        Math.PI / 2 + 0.8,
        Math.PI / 2,
        8,
        new BABYLON.Vector3(0, 1.5, 0),
        scene
    );
    camera.attachControl(canvas, true);

    camera.pinchDeltaPercentage = 0.002;
    camera.pinchPrecision = 200;
    camera.wheelDeltaPercentage = 0.002;
    camera.lowerRadiusLimit = 5;
    camera.upperRadiusLimit = 20;
    camera.lowerBetaLimit = 0;
    camera.upperBetaLimit = 1.7;
    camera.panningSensibility = 0;
    camera.inertia = 0.9;

    // ---------------- ENVIRONMENT ----------------
    scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/studio.env",
        scene
    );

    // ---------------- LIGHTS ----------------
    const key = new BABYLON.DirectionalLight("key", new BABYLON.Vector3(-0.5, -2, -0.5), scene);
    key.position = new BABYLON.Vector3(5, 10, 5);
    key.intensity = 1.0;

    const fill = new BABYLON.DirectionalLight("fill", new BABYLON.Vector3(1, -1, 0), scene);
    fill.intensity = 1.0;

    const rim = new BABYLON.DirectionalLight("rim", new BABYLON.Vector3(0.5, -0.5, 1), scene);
    rim.intensity = 2.0;

    const bounce = new BABYLON.PointLight("bounce", new BABYLON.Vector3(0, 2, 0), scene);
    bounce.intensity = 0.3;

    // ---------------- SHADOWS ----------------
    const shadowGen = new BABYLON.ShadowGenerator(256, key);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 32;
    shadowGen.blurScale = 6;
    shadowGen.darkness = 0.2;

    const shadowDisc = BABYLON.MeshBuilder.CreateDisc("shadowDisc", { radius: 6, tessellation: 64 }, scene);
    shadowDisc.receiveShadows = true;
    shadowDisc.rotation.x = Math.PI / 2;
    shadowDisc.position.y = 0.01;

    const shadowMat = new BABYLON.ShadowOnlyMaterial("shadowMat", scene);
    shadowMat.alpha = 0.2;
    shadowDisc.material = shadowMat;

    // ---------------- MODEL ----------------
    const result = await BABYLON.SceneLoader.ImportMeshAsync("", "./", "truck2.gltf", scene);
    result.meshes.forEach((m) => {
        if (m instanceof BABYLON.Mesh) {
            m.receiveShadows = false;
            m.castShadows = true;
            shadowGen.addShadowCaster(m);
        }
    });


    
    const screenMat = scene.getMaterialByName("Screen");

    // ---------------- GLASS FIX ----------------
    const glass = scene.getMaterialByName("windowglass");
    if (glass && glass instanceof BABYLON.PBRMaterial) {
        glass.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_REFRACTION;
        glass.alpha = 1;
        glass.subSurface.isRefractionEnabled = true;
        glass.subSurface.refractionIntensity = 1.0;
        glass.subSurface.indexOfRefraction = 1.5;
        glass.subSurface.maximumThickness = 0.2;
        glass.subSurface.useAlbedoToTintRefraction = true;
        glass.environmentIntensity = 1;
        glass.metallic = 0.0;
        glass.roughness = 0.0;
    }

    // ---------------- BADGE FIX ----------------
    const hypedMat = scene.getMaterialByName("Hyped");
    if (hypedMat) {
        const badgeTex = new BABYLON.Texture("./hyped.png", scene, false, true);
        badgeTex.invertY = false;
        badgeTex.hasAlpha = true;
        badgeTex.getAlphaFromRGB = true;

        hypedMat.albedoTexture = badgeTex;
        hypedMat.useAlphaFromAlbedoTexture = true;
        hypedMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_BLEND;
        hypedMat.alphaCutOff = 0.01;
        hypedMat.metallic = 0;
        hypedMat.roughness = 1;
        hypedMat.environmentIntensity = 1;
        hypedMat.backFaceCulling = false;
    }

    // ---------------- ANIMATIONS ----------------
    scene.animationGroups.forEach((g) => g.stop());

    const originalTransforms = new Map();
    scene.animationGroups.forEach((group) => {
        group.targetedAnimations.forEach((ta) => {
            const target = ta.target;
            if (!originalTransforms.has(target)) {
                originalTransforms.set(target, {
                    position: target.position.clone(),
                    rotationQuaternion: target.rotationQuaternion ? target.rotationQuaternion.clone() : null,
                    rotation: target.rotation.clone(),
                    scaling: target.scaling.clone(),
                });
            }
        });
    });

    function resetPose() {
        originalTransforms.forEach((rest, target) => {
            target.position.copyFrom(rest.position);
            target.scaling.copyFrom(rest.scaling);
            if (rest.rotationQuaternion) {
                if (!target.rotationQuaternion) {
                    target.rotationQuaternion = new BABYLON.Quaternion();
                }
                target.rotationQuaternion.copyFrom(rest.rotationQuaternion);
            } else {
                target.rotation.copyFrom(rest.rotation);
            }
        });
    }

    // ---------------- PERFORMANCE + FPS HUD ----------------
    const HIGH_QUALITY_SCALE = window.devicePixelRatio * 0.5;
    const LOW_QUALITY_SCALE = window.devicePixelRatio * 2;

    engine.setHardwareScalingLevel(HIGH_QUALITY_SCALE);

    const fpsDiv = document.createElement("div");
    //fpsDiv.style.display = "none";
    fpsDiv.style.position = "fixed";
    fpsDiv.style.top = "10px";
    fpsDiv.style.right = "10px";
    fpsDiv.style.padding = "8px 14px";
    fpsDiv.style.background = "rgba(0,0,0,0.6)";
    fpsDiv.style.color = "white";
    fpsDiv.style.fontSize = "22px";
    fpsDiv.style.fontFamily = "monospace";
    fpsDiv.style.borderRadius = "6px";
    fpsDiv.style.zIndex = "9999";
    fpsDiv.style.pointerEvents = "none";
    fpsDiv.innerText = "FPS: --";
    document.body.appendChild(fpsDiv);


    let fpsLast = performance.now();
    let fpsFrames = 0;

    let isInteracting = false;
    let interactionTimeout = null;
    const INTERACTION_IDLE_DELAY = 400;

    function dropQuality() {
        if (!isInteracting) {
            isInteracting = true;
            engine.setHardwareScalingLevel(LOW_QUALITY_SCALE);
        }
        if (interactionTimeout) clearTimeout(interactionTimeout);
    }

    function restoreQuality() {
        interactionTimeout = setTimeout(() => {
            isInteracting = false;
            engine.setHardwareScalingLevel(HIGH_QUALITY_SCALE);
        }, INTERACTION_IDLE_DELAY);
    }
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);


if (isMobile) {
    // MOBILE: interaction-based quality drop
    scene.onPointerObservable.add(() => {
        engine.setHardwareScalingLevel(LOW_QUALITY_SCALE);
    });

    scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
            setTimeout(() => {
                engine.setHardwareScalingLevel(HIGH_QUALITY_SCALE);
            }, INTERACTION_IDLE_DELAY);
        }
    });
}

    // scene.onPointerObservable.add(() => {
    //     dropQuality();
    // });

    // scene.onPointerObservable.add((pointerInfo) => {
    //     if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
    //         restoreQuality();
    //     }
    // });

    // ---------------- PANNING CLAMP ----------------
    //   const PAN_LIMIT = 1.2;
    //   function clampPan() {
    //     const t = camera.target;
    //     t.x = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, t.x));
    //     t.z = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, t.z));
    //     t.y = Math.max(-PAN_LIMIT * 0.5, Math.min(PAN_LIMIT * 0.5, t.y));
    //   }

    // ---------------- SMART IDLE RENDERING ----------------
    let needsRender = true;
    let lastInteraction = performance.now();
    const IDLE_TIMEOUT = 800;

    function animationsActive() {
        return scene.animationGroups.some(g => g.isPlaying);
    }

 scene.onPointerObservable.add((pointerInfo) => {
    if (
        pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN ||
        pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE ||
        pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP
    ) {
        lastInteraction = performance.now();
        needsRender = true;
    }
});
if (isMobile) {
    scene.onPointerObservable.add((pointerInfo) => {
        if (
            pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN ||
            pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE
        ) {
            engine.setHardwareScalingLevel(LOW_QUALITY_SCALE);
        }

        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
            setTimeout(() => {
                engine.setHardwareScalingLevel(HIGH_QUALITY_SCALE);
            }, INTERACTION_IDLE_DELAY);
        }
    });
}


    scene.onAfterRenderObservable.add(() => {
        if (
            camera.inertialAlphaOffset !== 0 ||
            camera.inertialBetaOffset !== 0 ||
            camera.inertialRadiusOffset !== 0 ||
            camera.inertialPanningX !== 0 ||
            camera.inertialPanningY !== 0
        ) {
            lastInteraction = performance.now();
            needsRender = true;
        }
    });

    scene.onBeforeRenderObservable.add(() => {
        fpsFrames++;
        const now = performance.now();
        if (now - fpsLast >= 500) {
            const fps = Math.round((fpsFrames * 1000) / (now - fpsLast));
            fpsDiv.innerText = `FPS: ${fps}`;
            fpsFrames = 0;
            fpsLast = now;
        }
        // clampPan();
    });

    engine.runRenderLoop(() => {
        const now = performance.now();

        const idleFor = now - lastInteraction;

        if (idleFor > 3000 && !animationsActive()) {
            enterDeepIdle();
            return;
        } else {
            exitDeepIdle();
        }

        if (needsRender || animationsActive() || idleFor < IDLE_TIMEOUT) {
            scene.render();
            needsRender = false;
        }


    });
    let deepIdle = false;

    function enterDeepIdle() {
        if (deepIdle) return;
        deepIdle = true;

        // Save animation state
        animState.clear();
        scene.animationGroups.forEach(g => {
            animState.set(g, g.isPlaying);
            if (g.isPlaying) g.pause();
        });

        scene.blockMaterialDirtyMechanism = true;
        scene.skipPointerMovePicking = true;
        scene.skipFrustumClipping = true;

        camera.inertia = 0;

        fpsDiv.style.display = "none";
    }

    function exitDeepIdle() {
        if (!deepIdle) return;
        deepIdle = false;

        scene.blockMaterialDirtyMechanism = false;
        scene.skipPointerMovePicking = false;
        scene.skipFrustumClipping = false;

        camera.inertia = 0.9;

        // Restore animation state
        animState.forEach((wasPlaying, g) => {
            if (wasPlaying) g.play(true);
        });

        //fpsDiv.style.display = "block";

        needsRender = true;
        lastInteraction = performance.now();
    }
    let rafActive = true;

    function stopRAF() {
        if (!rafActive) return;
        rafActive = false;
        engine.stopRenderLoop();
    }

    function startRAF() {
        if (rafActive) return;
        rafActive = true;
        function renderLoop() {
            const now = performance.now();
            const idleFor = now - lastInteraction;

            // Enter deep idle after 3 seconds
            if (idleFor > 3000 && !animationsActive()) {
                enterDeepIdle();
                stopRAF(); // FULL SLEEP
                return;
            }

            exitDeepIdle();

            if (needsRender || animationsActive() || idleFor < IDLE_TIMEOUT) {
                scene.render();
                needsRender = false;
            }
        }

        engine.runRenderLoop(renderLoop);

    }


    // ---------------- RESIZE ----------------
    window.addEventListener("resize", () => {
        engine.resize();
        const scale = engine.getHardwareScalingLevel();
        engine.setHardwareScalingLevel(scale);
    });

    window.addEventListener("orientationchange", () => {
        setTimeout(() => {
            engine.resize();
            const scale = engine.getHardwareScalingLevel();
            engine.setHardwareScalingLevel(scale);
        }, 200);
    });

    return { scene, camera, screenMat };
};
