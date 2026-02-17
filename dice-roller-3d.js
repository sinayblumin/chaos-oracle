/**
 * Lightweight 3D Dice Controller using Three.js and Cannon-es
 * Compatible with static hosts.
 */

window.DiceRoller3D = (function () {
    let scene, camera, renderer, world;
    let dice = [];
    let container;
    let frameId;
    let isInitialized = false;

    // Physics constants
    const floorY = -2;

    function init(targetId) {
        if (isInitialized) return;
        container = document.getElementById(targetId);
        if (!container) return;

        // 1. Scene Setup
        scene = new THREE.Scene();

        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || 300;

        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(0, 14, 10); // Steeper angle, slightly closer
        camera.lookAt(0, 0, 0); // Look at center volume, not floor. This centers them better.

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
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Brighter
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0xffffff, 0.7); // Brighter
        pointLight.position.set(-10, 15, -10);
        scene.add(pointLight);

        // 3. Physics Setup
        world = new CANNON.World();
        world.gravity.set(0, -9.82, 0);
        world.allowSleep = true;

        // Add bounciness (dice on floor)
        const diceMaterial = new CANNON.Material();
        const contactMaterial = new CANNON.ContactMaterial(diceMaterial, diceMaterial, {
            restitution: 0.7, // More bouncy like Google
            friction: 0.1     // Less friction for more sliding
        });
        world.addContactMaterial(contactMaterial);

        // 4. Ground Plane (for physics and shadows)
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
        const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0, material: diceMaterial });
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        groundBody.position.set(0, floorY, 0);
        world.addBody(groundBody);

        // Walls to keep dice in view
        createWall(0, 0, -6, 0, diceMaterial);
        createWall(0, 0, 6, Math.PI, diceMaterial);
        createWall(-6, 0, 0, Math.PI / 2, diceMaterial);
        createWall(6, 0, 0, -Math.PI / 2, diceMaterial);

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
        world.step(1 / 60);

        dice.forEach(d => {
            d.mesh.position.copy(d.body.position);
            d.mesh.quaternion.copy(d.body.quaternion);
        });

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
            // Removed baked-in gradient to allow true material color to show (fixes D6 wash-out)
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // Text - MEGA SIZE with white border
        ctx.fillStyle = '#ffffff'; // All-white fill
        ctx.font = `900 ${fontSize}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.strokeStyle = '#ffffff'; // All-white stroke for MEGA boldness
        ctx.lineWidth = fontSize / 16; // Proportional scaling (was fixed 14)
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

    function addLabelsToMesh(mesh, sides, values = null) {
        const geometry = mesh.geometry.isBufferGeometry ? mesh.geometry.toNonIndexed() : mesh.geometry;
        const pos = geometry.attributes.position;
        const normal = geometry.attributes.normal;
        const diceColor = '#ffcc00';

        // Filter valid face centers (avoid duplicates on same face)
        // For polyhedral dice (sides 4-20), we group by face normal using Dot Product
        // This is robust against floating point noise and "bent" faces (like D10 kites)
        const groups = [];

        for (let i = 0; i < pos.count; i += 3) {
            const v1 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            const v2 = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
            const v3 = new THREE.Vector3(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
            const center = new THREE.Vector3().add(v1).add(v2).add(v3).divideScalar(3);

            if (sides <= 20) {
                // Determine face normal
                let cb = new THREE.Vector3();

                // CRITICAL FIX: Use the geometry's vertex normal if available!
                // This adheres to the manually unified normals of the D10, 
                // ensuring the two triangles of the kite are treated as ONE face.
                if (normal) {
                    // Use normal from first vertex of triangle (assuming flat shading/unified)
                    cb.set(normal.getX(i), normal.getY(i), normal.getZ(i));
                } else {
                    // Fallback to calculating from positions
                    const ab = new THREE.Vector3().subVectors(v1, v2);
                    const ac = new THREE.Vector3().subVectors(v3, v2);
                    cb.crossVectors(ac, ab).normalize();
                }

                // Find existing group with similar normal (dot > 0.9 ~ 25 degrees tolerance)
                let bestGroup = null;
                for (const g of groups) {
                    if (g.normal.dot(cb) > 0.9) {
                        bestGroup = g;
                        break;
                    }
                }

                if (bestGroup) {
                    bestGroup.centers.push(center);
                } else {
                    groups.push({ normal: cb, centers: [center] });
                }
            } else {
                // Fallback for D100
                const minDist = sides > 30 ? 0.3 : 0.6;
                let found = false;
                for (const g of groups) {
                    if (g.centers[0].distanceTo(center) < minDist) {
                        found = true;
                        break;
                    }
                }
                if (!found) groups.push({ normal: null, centers: [center] });
            }
        }

        // Calculate average center for each group
        const faceCenters = groups.map(g => {
            const avg = new THREE.Vector3();
            g.centers.forEach(c => avg.add(c));
            return avg.divideScalar(g.centers.length);
        });

        // Sort centers for deterministic numbering
        // For D10, we want to ensure height-based sorting (0-4 on top, 5-9 on bottom)
        faceCenters.sort((a, b) => (b.y - a.y) || (a.x - b.x));

        faceCenters.slice(0, sides).forEach((center, idx) => {
            const val = values ? values[idx] : (idx + 1).toString();
            // Scale label as large as possible for the shape
            let labelSize = 1.4;
            if (sides > 12) labelSize = 1.2;
            if (sides > 20) labelSize = 0.8;
            if (sides > 50) labelSize = 1.2;

            const labelGeom = new THREE.PlaneGeometry(labelSize, labelSize);
            const fontScale = sides > 50 ? 120 : 180; // Scale 450 -> 220 as requested
            const labelMat = createDiceMaterial('', val, fontScale, true);
            const labelMesh = new THREE.Mesh(labelGeom, labelMat);

            // Position slightly more outward but tightly to ensure no clipping
            labelMesh.position.copy(center).multiplyScalar(1.03);
            labelMesh.lookAt(center.clone().multiplyScalar(2));
            mesh.add(labelMesh);
        });
    }

    function createDice(sides = 6) {
        let geometry;
        let shape;
        let mass = 1.8;
        let materials = [];
        const baseSize = 3.2;

        if (sides === 6) {
            geometry = new THREE.BoxGeometry(baseSize * 0.9, baseSize * 0.9, baseSize * 0.9);
            shape = new CANNON.Box(new CANNON.Vec3(baseSize * 0.45, baseSize * 0.45, baseSize * 0.45));
            for (let i = 1; i <= 6; i++) {
                materials.push(createDiceMaterial(diceColor, i.toString(), 140));
            }
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
                    // D10 Pentagonal Trapezohedron with Unified Normals (looks like 10 faces, not 20)
                    const r = 1.3;      // Radius
                    const h = 1.6;      // Height
                    const tHeight = 0.3; // Waist offset

                    // Vertices
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

                    // Helper to push triangle with specific normal
                    function pushTri(v1, v2, v3, n) {
                        vertices.push(...v1, ...v2, ...v3);
                        normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
                    }

                    // Build 10 faces
                    for (let i = 0; i < 5; i++) {
                        // Top Kite: NorthPole, Upper[i], Lower[i], Upper[next]
                        // We need to form a kite from: NorthPole -> Upper[i] -> Lower[i] -> Upper[(i+1)%5]
                        // Actually standard trapezohedron faces are:
                        // Top faces connect NorthPole to Upper[i] and Upper[i+1]? No, that's a pyramid.
                        // A D10 face connects: NorthPole, Upper[i], Lower[i] ?? 
                        // Let's use the standard connectivity:
                        // Face K_top_i: NorthPole, Upper[i], Lower[i], Upper[next] is not planar usually.
                        // Standard: NorthPole, Upper[i], Lower[i], Upper[(i+1)%5]... 

                        // Let's construct it symmetrically.
                        // Face i (Top): Pole, Upper[i], Lower[i], Upper[(i+1)%5] ? No.
                        // Let's look at the shape: Zig-zag equator.
                        // Top faces meet at North Pole. There are 5 top faces? No, D10 has 10 faces meeting at 2 poles?
                        // A D10 has 5 faces sharing the top pole, 5 sharing the bottom.
                        // Face i: NorthPole, Upper[i], Lower[i], Upper[(i+1)%5] -- if this is the quad.

                        // Let's use indices:
                        const p = new THREE.Vector3(...northPole);
                        const u1 = new THREE.Vector3(...upperRing[i]);
                        const u2 = new THREE.Vector3(...upperRing[(i + 1) % 5]);
                        const l = new THREE.Vector3(...lowerRing[i]); // The point between u1 and u2? 

                        // Actually, LowerRing is offset by 36deg.
                        // So L[i] is between U[i] and U[i+1].
                        // So Quad is: P -> u1 -> l -> u2.

                        // Calculate Plane Normal for this Quad (Kite)
                        // defined by P, u1, l, u2.
                        // Normal of P-u1-u2 (Triangle) is close.
                        const n = new THREE.Vector3().crossVectors(
                            new THREE.Vector3().subVectors(u1, p),
                            new THREE.Vector3().subVectors(u2, p)
                        ).normalize(); // Use the logic plane of the "pyramid" side roughly

                        // Refined normal: Average of the two constituent triangles
                        const n1 = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(u1, p), new THREE.Vector3().subVectors(l, p)).normalize().negate(); // check winding
                        // Winding P->U1->L
                        const t1_v1 = new THREE.Vector3().subVectors(u1, p);
                        const t1_v2 = new THREE.Vector3().subVectors(l, p);
                        const norm1 = new THREE.Vector3().crossVectors(t1_v2, t1_v1).normalize();

                        const t2_v1 = new THREE.Vector3().subVectors(l, p);
                        const t2_v2 = new THREE.Vector3().subVectors(u2, p);
                        const norm2 = new THREE.Vector3().crossVectors(t2_v2, t2_v1).normalize();

                        const avgNorm = new THREE.Vector3().addVectors(norm1, norm2).normalize();

                        // Push Top Kite (2 triangles) with Unified Normal
                        pushTri(northPole, upperRing[i], lowerRing[i], avgNorm);
                        pushTri(northPole, lowerRing[i], upperRing[(i + 1) % 5], avgNorm);

                        // Push Bottom Kite (mirror)
                        // SouthPole, Lower[i], Upper[(i+1)%5], Lower[(i+1)%5]
                        // Note: indexing aligns with the gap
                        const sp = new THREE.Vector3(...southPole);
                        const l1 = new THREE.Vector3(...lowerRing[i]);
                        const l2 = new THREE.Vector3(...lowerRing[(i + 1) % 5]);
                        const uNext = new THREE.Vector3(...upperRing[(i + 1) % 5]);

                        // Calculate normal
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
                case 100:
                    // Faceted Golf-ball Zocchihedron
                    geometry = new THREE.IcosahedronGeometry(baseSize * 1.7, 1);
                    shape = new CANNON.Sphere(baseSize * 1.7);
                    mass = 3.5;
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
            let labels = null;
            if (sides === 10) labels = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
            addLabelsToMesh(mesh, sides, labels);
        }

        scene.add(mesh);

        const body = new CANNON.Body({
            mass: mass,
            linearDamping: 0.4,
            angularDamping: 0.4,
            allowSleep: true,
            sleepSpeedLimit: 0.2,
            sleepTimeLimit: 0.8
        });
        body.addShape(shape);

        // Physics material
        const mat = new CANNON.Material();
        body.material = mat;
        if (world.contactmaterials && world.contactmaterials.length > 0) {
            // Use existing contact material
        }

        body.position.set(Math.random() * 4 - 2, 8, Math.random() * 4 - 2);
        body.quaternion.setFromEuler(Math.random() * 10, Math.random() * 10, Math.random() * 10);
        body.velocity.set(Math.random() * 8 - 4, -15, Math.random() * 8 - 4);
        body.angularVelocity.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);

        world.addBody(body);
        dice.push({ mesh, body, sides });
    }

    function roll(notation) {
        clear();
        const diceRegex = /(\d+)d(\d+)/g;
        let match;
        let found = false;

        while ((match = diceRegex.exec(notation.toLowerCase())) !== null) {
            const count = parseInt(match[1]) || 1;
            const sides = parseInt(match[2]);

            for (let i = 0; i < Math.min(count, 10); i++) {
                createDice(sides);
            }
            found = true;
        }

        if (!found) createDice(6);
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
        clear
    };
})();
