/* ==========================================================================
 * 29-world.js — assembles the scene graph from the builders and exposes
 * the handles the narrative needs (poet, storks, boats, lamps, vision).
 * ========================================================================== */
const World = (() => {
  const scene = new THREE.Scene();
  const main = new THREE.Group();
  main.name = 'main';
  scene.add(main);
  const H = {}; // handles

  async function build(quality, progress) {
    SL.installChunks();
    progress(0.02, '勘定山河');
    await U.nextFrame();
    Terrain.init();

    progress(0.05, '塑造山河');
    const vps = [[0, 57, 0, 1], [-410, 14, 380, 0.55], [-430, 18, 900, 0.5], [-380, 70, 1700, 0.5], [60, 36, 0, 0.8]];
    Terrain.buildMesh(quality, vps);
    const tmat = Terrain.makeMaterial();
    const meshes = await Terrain.buildGeometry(quality, tmat, (f) => progress(0.05 + f * 0.33, '塑造山河'));
    for (const m of meshes) main.add(m);

    progress(0.4, '引来大河');
    await U.nextFrame();
    H.river = Water.riverMesh();
    main.add(H.river);

    progress(0.45, '营建楼阁');
    await U.nextFrame();
    H.tower = Tower.build(quality);
    main.add(H.tower.group);

    progress(0.55, '植松种柳');
    await U.nextFrame();
    H.flora = Flora.build(quality);
    main.add(H.flora.group);

    progress(0.66, '筑城造屋');
    await U.nextFrame();
    H.city = Settlement.build(quality);
    main.add(H.city.group);

    progress(0.72, '鹳雀归来');
    await U.nextFrame();
    main.add(Fauna.buildStorks(H.tower.perches));
    main.add(Fauna.buildBoats());

    progress(0.76, '诗人登场');
    H.poet = Figures.makeFigure({ robe: 0xe6e0d0, robeDark: 0xcdc3ad, hat: 'futou', beard: true, pick: 'poet' });
    main.add(H.poet.root);
    // a keeper sweeping the court by the stair, and two townsfolk at the city gate
    H.keeper = Figures.makeFigure({ robe: 0x5d6570, robeDark: 0x4a515a, hat: 'kerchief', beard: false, skirtLen: 0.7, pick: 'city' });
    H.keeper.broom = Figures.broom(H.keeper.arms[1].elbow);
    H.keeper.broom.position.set(0, -0.32, 0.05);
    H.keeper.broom.rotation.x = 0.4;
    main.add(H.keeper.root);
    H.towns = [
      Figures.makeFigure({ robe: 0x7a6248, robeDark: 0x5f4b37, hat: 'kerchief', beard: false, skirtLen: 0.6, pick: 'city' }),
      Figures.makeFigure({ robe: 0x4f6a78, robeDark: 0x3f5560, hat: 'kerchief', beard: true, skirtLen: 0.8, pick: 'city' }),
    ];
    for (const f of H.towns) main.add(f.root);

    progress(0.8, '点染天色');
    await U.nextFrame();
    H.dome = Sky.createDome();
    scene.add(H.dome);
    H.cloudBanks = Sky.createCloudBanks([
      { x: 9000, z: 9000, y: 1500, radius: 2600, height: 1500, stretch: 1.6, puff: 1400, count: 60 },
      { x: 15000, z: -2000, y: 1700, radius: 3200, height: 1800, stretch: 1.3, puff: 1700, count: 70 },
      { x: -2000, z: 17000, y: 1400, radius: 3000, height: 1200, stretch: 1.8, puff: 1500, count: 55 },
      { x: 3000, z: -17000, y: 1500, radius: 3400, height: 1400, stretch: 1.5, puff: 1600, count: 55 },
      { x: -16000, z: -6000, y: 1800, radius: 2600, height: 900, stretch: 2.2, puff: 1500, count: 40 },
    ], quality.cloudPuffs, 11);
    main.add(H.cloudBanks);

    progress(0.86, '心象千里');
    await U.nextFrame();
    H.vision = Vision.build(quality);
    scene.add(H.vision.group);
    H.visionBirds = [Fauna.makeFlyer(), Fauna.makeFlyer(), Fauna.makeFlyer()];
    for (const b of H.visionBirds) H.vision.group.add(b);

    Env.init(scene, quality);
    // make sure every material got the shared uniforms
    scene.traverse((o) => {
      if (!o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (!m.userData.patched && !m.isShaderMaterial) SL.patch(m, {});
    });
    progress(0.92, '调和光色');
    return H;
  }

  function setVision(on) {
    main.visible = !on;
    if (H.vision) H.vision.group.visible = on;
  }

  function update(dt, time, camera) {
    SL.G.uTime.value = time;
    Sky.follow(camera);
    if (H.river) Env.ambientColor(H.river.material.uniforms.uAmbient.value);
    if (H.vision) Env.ambientColor(H.vision.sea.material.uniforms.uAmbient.value);
  }

  return { scene, main, build, update, setVision, H };
})();
