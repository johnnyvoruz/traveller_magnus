/**
 * PROJECT AS ABOVE, SO BELOW
 * Module: MgT2E Bottom-Up Generator (Orchestrator)
 * Description: Master controller for Mongoose Traveller 2E bottom-up system generation.
 * Following the "Sean Protocol": Zero Logic, Pure Orchestration, Trace Logging.
 * 
 * Architectural Constraint: This module contains ZERO generation logic.
 * It only manages state and calls engine functions in the correct sequence.
 */
import * as StellarEngine from './mgt2e_stellar_engine.js';
import * as WorldEngine from './mgt2e_world_engine.js';
import * as SocioEngine from './mgt2e_socio_engine.js';
import * as Auditor from './mgt2e_uwp_auditor.js';
import { reseedForHex, shouldGeneratePopulation } from './core/rng.js';
import { trace, writeLogLine, startTrace, tSection, tResult, tSkip, endTrace } from './core/trace.js';
import { applyMgT2EOrbitalNames } from './core/names.js';
import { genState } from './core/settings.js';
import { restoreSeedWorldsIntoGenerated, captureSeededMoonCaps, trimGeneratedMoonsToSeededCaps, captureSeededRingCaps, trimGeneratedRingsToSeededCaps } from './seed_restoration.js';
import { MgT2EMath } from './mgt2e_math.js';
import { generateStellarSystem, generateSystemInventory, allocateOrbits, walkMgT2ESystem, logMgT2EBodyBiography } from './mgt2e_stellar_engine.js';
import { generatePhysicals, generateAtmospherics, generateRotationalDynamics, generateBiospherics, evaluateMainworldCandidates } from './mgt2e_world_engine.js';
import { generateCoreSocial, generateExtendedSocioeconomics, finalizeSubordinateSocial, generateMainworldUWP } from './mgt2e_socio_engine.js';
import { runAndLog } from './mgt2e_uwp_auditor.js';
    if (!StellarEngine || !WorldEngine || !SocioEngine) {
        console.error("MgT2EBottomUpGenerator DI Failure: Critical engines missing!", { StellarEngine, WorldEngine, SocioEngine });
    }


    /**
     * Main MgT2E Bottom-Up Generation Orchestrator.
     * Executes the complete pipeline for system generation.
     *
     * @param {string} hexId   - The hex identifier for this system
     * @param {Object} [seedSys=null] - Optional seed from the System Editor. When null,
     *   generation is fully stochastic (all existing macro calls). When provided:
     *   - Stars/worlds are taken from seedSys instead of being rolled
     *   - seedSys._allowAddBodies: if false, inventory/allocation phases are skipped
     *   - seedSys._mainworldRef: _id of the body to designate as mainworld (skips election)
     * @returns {Object} sys - The fully populated system object
     */
    function generateMgT2ESystemBottomUp(hexId, seedSys = null) {
        // =================================================================
        // PHASE 1: INITIALIZATION & SKELETON
        // =================================================================

        // Initialize trace logging
        if (typeof startTrace === 'function' && trace.enabled) {
            startTrace(hexId, 'MgT2E Bottom-Up System');
        }

        // Reseed RNG for this hex
        if (typeof reseedForHex === 'function') {
            reseedForHex(hexId);
        }
        genState.currentSystemHasPop = (typeof shouldGeneratePopulation === 'function') ? shouldGeneratePopulation(hexId) : true;

        // Create base system object — seed from seedSys if provided, otherwise start fresh
        const sys = seedSys ? {
            hexId: hexId,
            worlds: (seedSys.worlds || []).map(b => Object.assign({}, b)),
            stars:  (seedSys.stars  || []).map(s => Object.assign({}, s)),
            age:              seedSys.age  || 0,
            hzco:             seedSys.hzco || 0,
            gasGiants:        0,
            planetoidBelts:   0,
            terrestrialPlanets: 0,
            totalWorlds:      0,
            baselineOrbit:    0,
            forbiddenZones:   []
        } : {
            hexId: hexId,
            worlds: [],
            stars: [],
            age: 0,
            hzco: 0,
            gasGiants: 0,
            planetoidBelts: 0,
            terrestrialPlanets: 0,
            totalWorlds: 0,
            baselineOrbit: 0,
            forbiddenZones: []
        };

        // 1. Generate stellar system (Primary + companions) — skip if seedSys provides stars
        if (!seedSys || !sys.stars.length) {
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 1: Stellar Generation...`);
            if (StellarEngine && StellarEngine.generateStellarSystem) {
                StellarEngine.generateStellarSystem(sys, hexId, null, 'bottom-up');
            }
        } else {
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 1: Stellar skipped — seed provides ${sys.stars.length} star(s).`);
        }

        // 2 & 3. Generate inventory + allocate orbits — skip if seedSys controls body count
        if (!seedSys || seedSys._allowAddBodies) {
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 1: Inventory... (Terrestrials: ${sys.terrestrialPlanets})`);
            if (StellarEngine && StellarEngine.generateSystemInventory) {
                StellarEngine.generateSystemInventory(sys);
            }
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 1: Allocation... (Total Worlds: ${sys.totalWorlds})`);
            if (StellarEngine && StellarEngine.allocateOrbits) {
                StellarEngine.allocateOrbits(sys);
            }
            // After allocateOrbits wipes and rebuilds sys.worlds, restore each seed world's
            // user data (name, UWP, _id, locked fields) onto the nearest-orbit generated world
            // of the same body category. Must run before generatePhysicals so the locked
            // fields are honoured by the physics engines. Shared helper (OW-6) — see
            // js/seed_restoration.js; CT/RTT will reuse this once they gain the same gating.
            if (typeof SeedRestoration !== 'undefined') {
                SeedRestoration.restoreSeedWorldsIntoGenerated(sys, seedSys);
            }
        } else {
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 1: Inventory/Allocation skipped — seed provides ${sys.worlds.length} world(s), _allowAddBodies=false.`);
        }

        // 4. Initial Physical Sizing (Size, Mass, Gravity)
        // When seeded and not allowing new bodies, capture moon counts before generatePhysicals
        // runs so we can trim any dice-rolled additions back out. The seed's moons array is a
        // shared reference (Object.assign shallow copy), so generatePhysicals can extend it.
        // Shared helper (OW-6) — see js/seed_restoration.js.
        const _seededMoonCaps = (typeof SeedRestoration !== 'undefined')
            ? SeedRestoration.captureSeededMoonCaps(sys, seedSys)
            : null;
        const _seededRingCaps = (typeof SeedRestoration !== 'undefined')
            ? SeedRestoration.captureSeededRingCaps(sys, seedSys)
            : null;

        if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 1: Physics... (Found ${sys.worlds.length} worlds)`);
        if (WorldEngine && WorldEngine.generatePhysicals) {
            WorldEngine.generatePhysicals(sys);
        }

        // Trim back any moons/rings generatePhysicals added beyond the seeded count.
        if (typeof SeedRestoration !== 'undefined') {
            SeedRestoration.trimGeneratedMoonsToSeededCaps(sys, seedSys, _seededMoonCaps);
            SeedRestoration.trimGeneratedRingsToSeededCaps(sys, _seededRingCaps);
        }

        // =================================================================
        // PHASE 2: CANDIDATE FLESHING
        // =================================================================
        
        tSection('Phase 2: Candidate Fleshing');
        
        // --- SEAN PROTOCOL: Candidate Expansion ---
        // We must flatten nested moons into the candidate pool so they can be considered for Mainworld status.
        let candidatesToAdd = [];
        sys.worlds.forEach(w => {
            if (w.moons && w.moons.length > 0) {
                w.moons.forEach(m => {
                    if (m.type === 'Satellite') {
                        m.isMoon = true;
                        m.isSatellite = true;
                        m.parentType = w.type;
                        m.isMoonOfGG = (w.type === 'Gas Giant');
                        candidatesToAdd.push(m);
                    }
                });
            }
        });

        // Step A: Identification of candidates for Mainworld eligibility
        let candidates = sys.worlds.filter(w => 
            w.type === 'Terrestrial Planet' || 
            w.type === 'Satellite' || 
            w.type === 'Planetoid Belt'
        );

        if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 2: Found ${candidates.length} top-level candidates and ${candidatesToAdd.length} moons.`);

        if (WorldEngine) {
            // Generate atmospherics for candidates (restricted to targetWorlds)
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 2: Generating Atmospherics...`);
            if (WorldEngine.generateAtmospherics) {
                WorldEngine.generateAtmospherics(sys, { 
                    targetWorlds: candidates, 
                    mode: 'bottom-up' 
                });
            }

            // Generate rotational dynamics for candidates
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 2: Generating Rotational...`);
            if (WorldEngine.generateRotationalDynamics) {
                WorldEngine.generateRotationalDynamics(sys, { 
                    targetWorlds: candidates, 
                    mode: 'bottom-up' 
                });
            }

            // Generate biospherics for candidates
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 2: Generating Biospherics...`);
            if (WorldEngine.generateBiospherics) {
                WorldEngine.generateBiospherics(sys, { 
                    targetWorlds: candidates, 
                    mode: 'bottom-up' 
                });
            }

            // =================================================================
            // PHASE 3: MAINWORLD SELECTION (CROWNING)
            // =================================================================
            
            tSection('Phase 3: Mainworld Selection');
            
            // SEAN PROTOCOL: Inject moons into the candidate pool for Mainworld consideration
            // This happens *after* physics generation to preserve engine iteration constraints
            candidates = candidates.concat(candidatesToAdd);
            
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 3: Selection from ${candidates.length} candidates...`);

            // If seedSys designates a mainworld, find it by _id; otherwise run normal election
            let mainworld = null;
            if (seedSys && seedSys._mainworldRef) {
                mainworld = sys.worlds.find(w => w._id === seedSys._mainworldRef);
                if (!mainworld) {
                    for (const w of sys.worlds) {
                        const moon = (w.moons || []).find(m => m._id === seedSys._mainworldRef);
                        if (moon) { mainworld = moon; break; }
                    }
                }
                if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 3: Mainworld from seed ref: ${mainworld ? mainworld._id : 'NOT FOUND'}`);
            }
            if (!mainworld) {
                mainworld = WorldEngine.evaluateMainworldCandidates(candidates);
            }

            if (mainworld) {
                mainworld.type = 'Mainworld';
                sys.mainworld = mainworld;
                
                // SEAN PROTOCOL: Moon-Mainworld Selection Logging
                if (mainworld.isMoon) {
                    tResult('Mainworld Status', 'LUNAR SELECTION', 'MgT2E 1.3: Top-Down Lunar Rule');
                    writeLogLine(`[MAINWORLD LOG] Hex ${sys.hexId}: Mainworld is a MOON at Orbit ${mainworld.orbitId != null ? mainworld.orbitId.toFixed(2) : '?'}`);
                }

                tResult('Winning Mainworld', `${mainworld.name || 'Body'} at Orbit ${mainworld.orbitId != null ? mainworld.orbitId.toFixed(2) : '?'} [Score: ${mainworld.habitability}]`, 'MgT2E 1.3: Orbital Allocation');
            } else {
                tResult('Winning Mainworld', 'None', 'MgT2E 1.3: Orbital Allocation');
                if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 3 ERROR: No winning mainworld elected!`);
            }
        }

        // =================================================================
        // PHASE 4: FULL SYSTEM POPULATION
        // =================================================================
        
        tSection('Phase 4: Full System Population');

        // Flesh out remaining worlds that weren't candidates (Gas Giants, etc.)
        let remainingWorlds = sys.worlds.filter(w => !candidates.includes(w));
        
        if (WorldEngine) {
            WorldEngine.generateAtmospherics(sys, { 
                targetWorlds: remainingWorlds, 
                mainworldBase: sys.mainworld, 
                mode: 'bottom-up' 
            });
            WorldEngine.generateRotationalDynamics(sys, { 
                targetWorlds: remainingWorlds, 
                mainworldBase: sys.mainworld, 
                mode: 'bottom-up' 
            });
            WorldEngine.generateBiospherics(sys, { 
                targetWorlds: remainingWorlds, 
                mainworldBase: sys.mainworld, 
                mode: 'bottom-up' 
            });
        }

        // =================================================================
        // PHASE 5: SOCIAL SWEEPS
        // =================================================================
        
        if (SocioEngine) {
            // 1. Generate Mainworld social baseline (UWP) from its physicals
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 5: Socio baseline...`);
            if (sys.mainworld && SocioEngine.generateMainworldUWP) {
                SocioEngine.generateMainworldUWP(hexId, sys.mainworld);
                // The socio engine rolls gasGiant independently; override with the actual
                // world list. sys.gasGiants (rolled inventory count) is NOT reliable here —
                // it stays 0 whenever the System Editor locks body count (_allowAddBodies
                // false), even though sys.worlds may contain a user-added Gas Giant body.
                sys.mainworld.gasGiant = sys.worlds.some(w => w.type === 'Gas Giant');
            }

            // 2. Generate/Refresh core social for all worlds (Mainworld + Subordinates)
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 5: Core Social...`);
            if (SocioEngine.generateCoreSocial) {
                SocioEngine.generateCoreSocial(sys, sys.mainworld);
            }

            // Extended Socioeconomics
            // Only generate extended socioeconomic details if there are people
            if (sys.mainworld && sys.mainworld.pop > 0) {
                if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 5: Extended Socio...`);
                if (SocioEngine.generateExtendedSocioeconomics) {
                    SocioEngine.generateExtendedSocioeconomics(sys, sys.mainworld);
                }
            } else {
                if (typeof tSkip === 'function') {
                    tSkip('Population 0: Bypassing Extended Socioeconomics');
                }
            }

            // Finalize Subordinate Social
            if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 5: Finalizing Subordinates...`);
            if (SocioEngine.finalizeSubordinateSocial) {
                SocioEngine.finalizeSubordinateSocial(sys, sys.mainworld);
            }
        }

        // =================================================================
        // PHASE 6: JOURNEY MATH SWEEP (Phase 2 Integration)
        // =================================================================
        if (typeof MgT2EMath !== 'undefined' && MgT2EMath.performJourneyMathSweep) {
            MgT2EMath.performJourneyMathSweep(sys);
        }

        // =================================================================
        // PHASE 7: FINALIZATION & AUDIT
        // =================================================================
        
        // Assign systematic orbital names now that the world tree is fully assembled
        if (trace.enabled) writeLogLine(`[PROBE] Bottom-Up Phase 7: Orbital Naming...`);
        applyMgT2EOrbitalNames(sys);

        // System Audit — shared helper (OW-7): audits, attaches sys.auditResult, logs/backlogs
        // on failure. Was previously duplicated inline here and in mgt2e_topdown_generator.js.
        const activeAuditor = Auditor || (typeof MgT2E_UWP_Auditor !== 'undefined' ? MgT2E_UWP_Auditor : null);
        if (activeAuditor && activeAuditor.runAndLog) {
            activeAuditor.runAndLog(sys, hexId, { mode: 'bottom-up' });
        }

        // Action 6.4: Planet-Centric Biographies (v0.6.0.0)
        // Groups all disparate generation data into a human-readable biography per world.
        if (StellarEngine && StellarEngine.walkMgT2ESystem && StellarEngine.logMgT2EBodyBiography) {
            tSection('System Biographies');
            StellarEngine.walkMgT2ESystem(sys, (body) => {
                StellarEngine.logMgT2EBodyBiography(body);
            });
        }

        // Close trace logging
        if (typeof endTrace === 'function' && trace.enabled) {
            endTrace();
        }

        return sys;
    }

    // =================================================================
    // PUBLIC API
    // =================================================================
    

export { generateMgT2ESystemBottomUp as generateSystem };
export { generateMgT2ESystemBottomUp };
