/**
 * Lightweight 3D Dice Controller using Three.js and Cannon-es
 * Compatible with static hosts.
 *
 * Face-Result Sync: After physics settles, the top face of each die is read
 * and reported via an onSettled callback so the UI shows the correct number.
 */

window.DiceRoller3D = (function () {
    let scene, camera, renderer, world;
    let dice = [];
    let container;
    let frameId;
    let isInitialized = false;
    let settledCallback = null;
    let settledFired = false;

    // Physics constants
    const floorY = -6;

    function init(targetId) {
        if (isInitialized) return;
        container = document.getElementById(targetId);
        if (!container) return;

        // 1. Scene Setup
        scene = new THREE.Scene();

        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || 300;

        camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        camera.position.set(0, 14, 8);
        camera.lookAt(0, -3, 0);         // Center on where dice rest (floor=-6 + radius≈3)

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;
        container.appendChild(renderer.domElement);

        // Resize Handler
        window.addEventListener('resize', onWindowResize, false);

        // 2. Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0xffffff, 0.7);
        pointLight.position.set(-10, 15, -10);
        scene.add(pointLight);

        // 3. Physics Setup
        world = new CANNON.World();
        world.gravity.set(0, -30, 0);  // Strong gravity, slightly less extreme for visible arcs
        world.allowSleep = true;
        world.broadphase = new CANNON.NaiveBroadphase();
        world.solver.iterations = 10;

        // Contact materials: satisfying bounce + grippy floor
        const diceMaterial = new CANNON.Material('dice');
        const floorMaterial = new CANNON.Material('floor');
        const diceFloorContact = new CANNON.ContactMaterial(floorMaterial, diceMaterial, {
            restitution: 0.4,    // Satisfying bounces — 2-3 visible hops
            friction: 0.6        // High friction = dice stop rolling naturally
        });
        const diceDiceContact = new CANNON.ContactMaterial(diceMaterial, diceMaterial, {
            restitution: 0.35,
            friction: 0.5
        });
        world.addContactMaterial(diceFloorContact);
        world.addContactMaterial(diceDiceContact);

        // 4. Ground Plane (for physics and shadows)
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = floorY;   // Align shadow plane with physics floor
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0, material: floorMaterial });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        groundBody.position.set(0, floorY, 0);
        world.addBody(groundBody);

        // Walls — tighter box to keep dice in view
        createWall(0, 0, -5, 0, floorMaterial);
        createWall(0, 0, 5, Math.PI, floorMaterial);
        createWall(-5, 0, 0, Math.PI / 2, floorMaterial);
        createWall(5, 0, 0, -Math.PI / 2, floorMaterial);

        animate();
        isInitialized = true;
        console.log("DiceRoller3D initialized");
    }

    function createWall(x, y, z, angle, material) {
        const wallBody = new CANNON.Body({ mass: 0, material: material });
        wallBody.addShape(new CANNON.Plane());
        wallBody.position.set(x, y, z);
        wallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
        world.addBody(wallBody);
    }

    function animate() {
        frameId = requestAnimationFrame(animate);
        // Two sub-steps per frame for smoother, faster simulation
        world.step(1 / 60, 1 / 60, 2);

        dice.forEach(d => {
            d.mesh.position.copy(d.body.position);
            d.mesh.quaternion.copy(d.body.quaternion);
        });

        // Check if all dice have settled
        if (!settledFired && dice.length > 0 && settledCallback) {
            const allSleeping = dice.every(d =>
                d.body.sleepState === CANNON.Body.SLEEPING ||
                (d.body.velocity.length() < 0.05 && d.body.angularVelocity.length() < 0.05)
            );
            if (allSleeping) {
                settledFired = true;
                const results = readAllTopFaces();
                settledCallback(results);
            }
        }

        renderer.render(scene, camera);
    }

    function clear() {
        dice.forEach(d => {
            scene.remove(d.mesh);
            world.removeBody(d.body);
        });
        dice = [];
    }

    const diceColor = '#1a0000'; // Ultra-dark blood red for Chaos Oracle theme

    function createDiceMaterial(color, text, fontSize = 70, isLabel = false) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Background
        if (!isLabel) {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${fontSize}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = fontSize / 16;
        ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 4;

        return new THREE.MeshPhongMaterial({
            map: texture,
            transparent: isLabel,
            shininess: isLabel ? 0 : 25,
            specular: 0x333333
        });
    }

    /**
     * Add labels to a polyhedral mesh AND store face data for top-face reading.
     * Returns an array of { normal: Vector3, value: string } for later querying.
     */
    function addLabelsToMesh(mesh, sides, values = null) {
        const geometry = mesh.geometry.isBufferGeometry ? mesh.geometry.toNonIndexed() : mesh.geometry;
        const pos = geometry.attributes.position;
        const normal = geometry.attributes.normal;

        // Group triangles into faces by normal similarity
        // Use normal-based grouping for ALL dice (including D100)
        const groups = [];
        // D100 has smaller faces, so use a tighter threshold
        const dotThreshold = sides > 20 ? 0.95 : 0.9;

        for (let i = 0; i < pos.count; i += 3) {
            const v1 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            const v2 = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
            const v3 = new THREE.Vector3(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
            const center = new THREE.Vector3().add(v1).add(v2).add(v3).divideScalar(3);

            // Compute face normal from triangle vertices
            let cb = new THREE.Vector3();
            if (normal) {
                cb.set(normal.getX(i), normal.getY(i), normal.getZ(i));
            } else {
                const ab = new THREE.Vector3().subVectors(v1, v2);
                const ac = new THREE.Vector3().subVectors(v3, v2);
                cb.crossVectors(ac, ab).normalize();
            }

            let bestGroup = null;
            for (const g of groups) {
                if (g.normal.dot(cb) > dotThreshold) {
                    bestGroup = g;
                    break;
                }
            }

            if (bestGroup) {
                bestGroup.centers.push(center);
            } else {
                groups.push({ normal: cb.clone(), centers: [center] });
            }
        }

        // Calculate average center and normal for each group
        const faceData = groups.map(g => {
            const avg = new THREE.Vector3();
            g.centers.forEach(c => avg.add(c));
            avg.divideScalar(g.centers.length);
            return { center: avg, normal: g.normal.clone().normalize() };
        });

        // Sort for deterministic numbering
        faceData.sort((a, b) => (b.center.y - a.center.y) || (a.center.x - b.center.x));

        // Build face info array and add labels
        const faceInfos = [];
        faceData.slice(0, sides).forEach((face, idx) => {
            const val = values ? values[idx] : (idx + 1).toString();

            // Store for top-face reading later
            faceInfos.push({
                normal: face.normal.clone(),
                value: val
            });

            // Scale label
            let labelSize = 1.4;
            if (sides > 12) labelSize = 1.2;
            if (sides > 20) labelSize = 0.8;
            if (sides > 50) labelSize = 1.2;

            const labelGeom = new THREE.PlaneGeometry(labelSize, labelSize);
            const fontScale = sides > 50 ? 120 : 180;
            const labelMat = createDiceMaterial('', val, fontScale, true);
            const labelMesh = new THREE.Mesh(labelGeom, labelMat);

            labelMesh.position.copy(face.center).multiplyScalar(1.03);
            labelMesh.lookAt(face.center.clone().multiplyScalar(2));
            mesh.add(labelMesh);
        });

        return faceInfos;
    }

    /**
     * Read the top face of a single die by transforming face normals
     * to world space and finding which one points most upward (Y+).
     */
    function readTopFace(die) {
        if (!die.faceInfos || die.faceInfos.length === 0) {
            // D6 uses material indices, handle separately
            return readTopFaceD6(die);
        }

        const up = new THREE.Vector3(0, 1, 0);
        const meshQuat = die.mesh.quaternion;
        let bestDot = -Infinity;
        let bestValue = "?";

        die.faceInfos.forEach(face => {
            // Transform local normal to world space using die's current rotation
            const worldNormal = face.normal.clone().applyQuaternion(meshQuat);
            const dot = worldNormal.dot(up);
            if (dot > bestDot) {
                bestDot = dot;
                bestValue = face.value;
            }
        });

        return bestValue;
    }

    /**
     * Read top face for D6 (uses box geometry with 6 material indices).
     * Box face normals in Three.js BoxGeometry order: +X, -X, +Y, -Y, +Z, -Z
     * Material indices map to faces 1-6 in that order.
     */
    function readTopFaceD6(die) {
        const faceNormals = [
            new THREE.Vector3(1, 0, 0),   // material 0 → face 1
            new THREE.Vector3(-1, 0, 0),  // material 1 → face 2
            new THREE.Vector3(0, 1, 0),   // material 2 → face 3
            new THREE.Vector3(0, -1, 0),  // material 3 → face 4
            new THREE.Vector3(0, 0, 1),   // material 4 → face 5
            new THREE.Vector3(0, 0, -1)   // material 5 → face 6
        ];

        const up = new THREE.Vector3(0, 1, 0);
        const meshQuat = die.mesh.quaternion;
        let bestDot = -Infinity;
        let bestIdx = 0;

        faceNormals.forEach((normal, idx) => {
            const worldNormal = normal.clone().applyQuaternion(meshQuat);
            const dot = worldNormal.dot(up);
            if (dot > bestDot) {
                bestDot = dot;
                bestIdx = idx;
            }
        });

        return String(bestIdx + 1); // faces labeled 1-6
    }

    /**
     * Read top faces for all dice currently in the scene.
     * Combines percentile pairs (tens + ones) into a single D100 result.
     * Returns array of { sides: number, value: string }
     */
    function readAllTopFaces() {
        const results = [];
        let i = 0;
        while (i < dice.length) {
            const die = dice[i];
            // Check for percentile pair
            if (die.role === 'tens' && i + 1 < dice.length && dice[i + 1].role === 'ones') {
                const tensVal = parseInt(readTopFace(die), 10) || 0;   // 0, 10, 20, ..., 90
                const onesVal = parseInt(readTopFace(dice[i + 1]), 10) || 0; // 0-9
                let total = tensVal + onesVal;
                if (total === 0) total = 100; // 00 + 0 = 100%
                results.push({ sides: 100, value: String(total) });
                i += 2; // Skip both dice
            } else {
                results.push({
                    sides: die.sides,
                    value: readTopFace(die)
                });
                i++;
            }
        }
        return results;
    }

    function createDice(sides = 6, customLabels = null, customRole = null) {
        let geometry;
        let shape;
        let mass = 1.8;
        let materials = [];
        const baseSize = 3.2;
        let faceInfos = []; // Will store face data for top-face reading

        if (sides === 6) {
            geometry = new THREE.BoxGeometry(baseSize * 0.9, baseSize * 0.9, baseSize * 0.9);
            shape = new CANNON.Box(new CANNON.Vec3(baseSize * 0.45, baseSize * 0.45, baseSize * 0.45));
            for (let i = 1; i <= 6; i++) {
                materials.push(createDiceMaterial(diceColor, i.toString(), 140));
            }
            // D6 faceInfos are handled by readTopFaceD6, so leave empty
        } else {
            const baseMat = new THREE.MeshPhongMaterial({ color: diceColor, shininess: 40, side: THREE.DoubleSide });
            switch (sides) {
                case 4:
                    geometry = new THREE.TetrahedronGeometry(baseSize * 1.3);
                    shape = new CANNON.Sphere(baseSize * 1.0);
                    break;
                case 8:
                    geometry = new THREE.OctahedronGeometry(baseSize * 1.3);
                    shape = new CANNON.Sphere(baseSize * 1.1);
                    break;
                case 10:
                    // D10 Pentagonal Trapezohedron with Unified Normals
                    const r = 1.3;
                    const h = 1.6;
                    const tHeight = 0.3;

                    const northPole = [0, h, 0];
                    const southPole = [0, -h, 0];

                    const upperRing = [];
                    const lowerRing = [];
                    for (let i = 0; i < 5; i++) {
                        const theta = (i * 72) * Math.PI / 180;
                        upperRing.push([Math.cos(theta) * r, tHeight, Math.sin(theta) * r]);

                        const theta2 = ((i + 0.5) * 72) * Math.PI / 180;
                        lowerRing.push([Math.cos(theta2) * r, -tHeight, Math.sin(theta2) * r]);
                    }

                    const vertices = [];
                    const normals = [];

                    function pushTri(v1, v2, v3, n) {
                        vertices.push(...v1, ...v2, ...v3);
                        normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
                    }

                    for (let i = 0; i < 5; i++) {
                        const p = new THREE.Vector3(...northPole);
                        const u1 = new THREE.Vector3(...upperRing[i]);
                        const u2 = new THREE.Vector3(...upperRing[(i + 1) % 5]);
                        const l = new THREE.Vector3(...lowerRing[i]);

                        const t1_v1 = new THREE.Vector3().subVectors(u1, p);
                        const t1_v2 = new THREE.Vector3().subVectors(l, p);
                        const norm1 = new THREE.Vector3().crossVectors(t1_v2, t1_v1).normalize();

                        const t2_v1 = new THREE.Vector3().subVectors(l, p);
                        const t2_v2 = new THREE.Vector3().subVectors(u2, p);
                        const norm2 = new THREE.Vector3().crossVectors(t2_v2, t2_v1).normalize();

                        const avgNorm = new THREE.Vector3().addVectors(norm1, norm2).normalize();

                        pushTri(northPole, upperRing[i], lowerRing[i], avgNorm);
                        pushTri(northPole, lowerRing[i], upperRing[(i + 1) % 5], avgNorm);

                        // Bottom kite
                        const sp = new THREE.Vector3(...southPole);
                        const l1 = new THREE.Vector3(...lowerRing[i]);
                        const l2 = new THREE.Vector3(...lowerRing[(i + 1) % 5]);
                        const uNext = new THREE.Vector3(...upperRing[(i + 1) % 5]);

                        const b_t1_v1 = new THREE.Vector3().subVectors(l1, sp);
                        const b_t1_v2 = new THREE.Vector3().subVectors(uNext, sp);
                        const b_norm1 = new THREE.Vector3().crossVectors(b_t1_v1, b_t1_v2).normalize();

                        const b_t2_v1 = new THREE.Vector3().subVectors(uNext, sp);
                        const b_t2_v2 = new THREE.Vector3().subVectors(l2, sp);
                        const b_norm2 = new THREE.Vector3().crossVectors(b_t2_v1, b_t2_v2).normalize();

                        const b_avgNorm = new THREE.Vector3().addVectors(b_norm1, b_norm2).normalize();

                        pushTri(southPole, lowerRing[i], upperRing[(i + 1) % 5], b_avgNorm);
                        pushTri(southPole, upperRing[(i + 1) % 5], lowerRing[(i + 1) % 5], b_avgNorm);
                    }

                    geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
                    geometry.scale(baseSize * 0.5, baseSize * 0.5, baseSize * 0.5);
                    shape = new CANNON.Sphere(baseSize * 1.0);
                    break;
                case 12:
                    geometry = new THREE.DodecahedronGeometry(baseSize * 1.3);
                    shape = new CANNON.Sphere(baseSize * 1.2);
                    break;
                case 20:
                    geometry = new THREE.IcosahedronGeometry(baseSize * 1.4, 0);
                    shape = new CANNON.Sphere(baseSize * 1.3);
                    break;
                default:
                    geometry = new THREE.BoxGeometry(baseSize, baseSize, baseSize);
                    shape = new CANNON.Box(new CANNON.Vec3(baseSize / 2, baseSize / 2, baseSize / 2));
            }
            materials = baseMat;
        }

        const mesh = new THREE.Mesh(geometry, materials);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (sides !== 6) {
            // Use customLabels if provided, otherwise default for the die type
            let labels = customLabels;
            if (!labels && sides === 10) labels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
            faceInfos = addLabelsToMesh(mesh, sides, labels);
        }

        scene.add(mesh);

        const body = new CANNON.Body({
            mass: mass,
            linearDamping: 0.25,   // Natural deceleration
            angularDamping: 0.25,  // Prevents endless spinning
            allowSleep: true,
            sleepSpeedLimit: 0.08, // Very still before sleeping
            sleepTimeLimit: 0.4    // Quick result once still
        });
        body.addShape(shape);

        const mat = new CANNON.Material('dice');
        body.material = mat;

        // Spawn positioning: dice tossed from above/behind, landing at center
        const diceIdx = dice.length;
        const totalDice = Math.max(diceIdx + 1, 1);
        const xOffset = (diceIdx - (totalDice - 1) / 2) * 1.8;

        body.position.set(
            xOffset + (Math.random() - 0.5),       // Centered with slight jitter
            4 + Math.random() * 3,                  // Spawn above landing zone
            -3 + (Math.random() - 0.5) * 2          // Behind center
        );
        body.quaternion.setFromEuler(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        // Natural throw: arcing forward and down like a hand toss
        body.velocity.set(
            (Math.random() - 0.5) * 5,             // Slight lateral scatter
            -12 - Math.random() * 5,                // Downward momentum
            5 + Math.random() * 4                   // Forward throw into view
        );
        body.angularVelocity.set(
            (Math.random() - 0.5) * 25,             // Satisfying tumble
            (Math.random() - 0.5) * 25,
            (Math.random() - 0.5) * 25
        );

        world.addBody(body);
        dice.push({ mesh, body, sides, faceInfos, role: customRole || null });
    }

    /**
     * Create a percentile pair: two D10s, one for tens (00-90) and one for ones (0-9).
     */
    function createPercentilePair() {
        // Tens die: 00, 10, 20, ... 90
        createDice(10, ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"], 'tens');
        // Ones die: 0, 1, 2, ... 9
        createDice(10, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], 'ones');
    }

    function roll(notation, onSettled) {
        clear();
        settledCallback = onSettled || null;
        settledFired = false;

        const diceRegex = /(\d+)d(\d+)/g;
        let match;
        let found = false;

        while ((match = diceRegex.exec(notation.toLowerCase())) !== null) {
            const count = parseInt(match[1]) || 1;
            const sides = parseInt(match[2]);

            for (let i = 0; i < Math.min(count, 10); i++) {
                if (sides === 100) {
                    createPercentilePair();
                } else {
                    createDice(sides);
                }
            }
            found = true;
        }

        if (!found) createDice(6);
    }

    function getResults() {
        return readAllTopFaces();
    }

    function onWindowResize() {
        if (!camera || !renderer || !container) return;
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || 300;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    return {
        init,
        roll,
        clear,
        getResults
    };
})();
