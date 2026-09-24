# Geography, population and map visuals — discussion foundation

Discussion recorded: 2026-09-24.

Status: agreed conceptual direction with explicitly provisional mechanisms. The user will authorize actual geography changes in the dedicated Map Lab task when ready. This document does not authorize implementation or start another economic experiment.

Read with the [economy and policies foundation](economy-and-policies-discussion.md), [simulation foundations](economy-simulation-foundations.md), [Map Lab](map-lab.md), and the completed [copper investment experiment](economy-lab.md).

## 1. Scope clarification

The user explicitly corrected an overly broad deferral: **population migration and emerging urban centres belong in the initial economic/settlement scope. Ports, naval trade routes, blockades and physical goods transport are deferred.** Trade initially remains abstract exchange between countries, subject to supply, funded demand and policy.

“Initial” or “V1” in this part of the conversation refers to the first version of this proposed system. It does not undo the previously agreed V2.0 savegame break or authorize changing the currently playable game.

Geography can influence coastal economic opportunity without explicit ports or shipping. Future transport/control mechanics can replace assumed access with effective access, rather than making current settlement work depend on a complete maritime system.

The earlier copper lab, including delayed private investment, was accepted as a useful starting point and closed as the final experiment on that exact theme. Its formulas and simplified utilization remain revisable at implementation planning.

## 2. Preserve the geographic foundation

The user considers the Map Lab a valuable body of tested concepts. Moisture, temperature/heat, rainfall, drainage, elevation, terrain, water bodies and related geographic information must remain available to the eventual game's systems. They are world data, not disposable rendering inputs.

Storage, generation/versioning and simulation resolution remain open. Preserving this information does not imply a seasonal hydrology or weather simulation. Current laboratory climate and runoff values are simplified/illustrative, not calibrated physical measurements.

Geographic features retain identities and names independently of political borders. Detection and naming belong with map generation/authoring. Future demographic and economic systems consume those features; they should not infer physical geography from decorative artwork.

## 3. Migration and emerging urban centres

The accepted direction is gradual redistribution of population in response to economic opportunity, living conditions, infrastructure, security and geographic suitability. Government shapes conditions through policies and spending; it does not place residents or individual city buildings.

Proposed causal sequence:

1. Geography offers potential, such as cultivable land, water access or a mineral deposit.
2. Productive activity and investment make some of that potential economically useful. An undeveloped deposit is not already a livelihood.
3. Better opportunities and conditions attract some population over time.
4. Arrivals increase demand and the population supporting economic activity, while also putting pressure on infrastructure and public provision.
5. Sustained population concentration and development become an urban centre visible on the map.

The attraction must weaken when destinations cannot accommodate arrivals. An unlimited positive loop in which the best cell collects the entire population is not the intended outcome.

Urban centres describe existing settlement patterns. A centre may span neighbouring microcells; a cell boundary need not be a city boundary. Population density, infrastructure and the character of local activity matter. Dense population does not necessarily mean prosperity. Established towns persist through temporary downturns rather than disappearing immediately.

Ordinary opportunity-driven migration and faster displacement from war/severe deterioration were distinguished as useful candidate behaviours. Displaced people may seek safety before prosperity. Distance influencing movement and gradual, bounded transfers are proposals; rates, routing, destination selection and exact state remain undecided.

Migration conserves people: departures must match arrivals. Births, deaths and casualties are separate processes. **Internal migration first was an assistant recommendation, not a settled restriction. International migration/refugee rules remain open.** No full employment, individual household or person-agent simulation was accepted.

## 4. Coastal and lake opportunities without ports

The user wants natural coastal concentration, not a requirement to designate a coastal development zone before a shore has economic value.

Proposed mechanism: geographic accessibility improves the operating/distribution conditions of relevant activities, supporting investment and economic opportunity, which attracts residents. Initially, ocean shores receive a basic coastal access advantage. Infrastructure, local terrain and connection to surrounding population/productive land can refine it.

The exact formula is open. Avoid applying the same coast advantage independently to productivity, profits, investment and migration, which would count one cause several times. Activity matters: deposits strongly constrain mining, land/water constrain farming, while industry and services may benefit differently from access and concentration. Inland centres must remain possible.

The user also explicitly wants **lakes to generate opportunities and be ownable**. Large inland lakes could eventually support multiple countries and naval activity. Ownership of a water location is distinct from geography and from the military ability to control access. This does not move naval simulation into the initial economic scope.

Lake-shore opportunity is local to the water body and surrounding area, not automatic access to an international ocean market. Lake size and connected surroundings are candidate influences. Freshwater provision and maritime/coastal accessibility are separate benefits.

A bay, river mouth/delta, productive plains and useful inland resources may combine into particularly promising settlement areas. These establish potential, not a guaranteed “super city.” Different features should contribute distinct advantages rather than multiply identical access bonuses.

Later possibility, explicitly deferred: coastal economic advantage diminishes when usable maritime reach is reduced by control or interrupted access. The coastline does not disappear; the benefit obtainable from it changes.

## 5. Geography work before a population experiment

A tightly bounded migration experiment was assessed as feasible: modest map, one country, fixed population, geographic/accessibility inputs, one opportunity layer, infrastructure pressure, and density/urban overlays. Hold opportunities steady first, then change one district's opportunity gradually. Check conservation, concentration, inland centres, crowding, decline and sensitivity to map resolution.

This was a feasibility discussion, **not a GO to implement**. The user subsequently preferred progressing through visual/geographic improvements first: named bays and interpretable shore accessibility. A full economy/industry/demography integration is outside this proposed small test.

Changing microcell density must not itself multiply total population or generate more urban centres merely by increasing the number of cells. Area-based quantities and comparisons across resolutions are an evaluation requirement; exact geography need not rasterize identically at every resolution.

Read-only inspection found existing geographic data, seeded population/city demonstration fields and an illustrative food/oil economy. Those are reusable material, not an already implemented migration model. Coast shaping already produces indentations; a reliable classified/named bay registry and meaningful shore grades still need dedicated evaluation.

## 6. Candidate bay-detection vocabulary

Working game definition: a bay is an indentation of a larger water body, partially enclosed by land, with an identifiable opening toward that water body. Classification and naming should be conservative rather than naming every shoreline notch.

Candidate measurements:

| Measurement | Intended meaning |
| --- | --- |
| Mouth width | Width of the opening toward the larger water body |
| Inward extent | How far water reaches behind that opening |
| Interior area | Water area inside the candidate feature |
| Enclosure | Extent to which surrounding land separates the interior from open water |

The user's one-cell-wide, two-cells-inward example is a useful inlet candidate. “Deep” here means inward distance, not bathymetric depth below the water surface.

`inward extent / mouth width` is a candidate clue for enclosure, not a complete detector or accepted quality formula. A connecting strait/channel must not automatically be classified as a bay. Minimum extent, boundaries, nested features, multiple openings and naming thresholds remain to be tested visually. Distances/areas should use a consistent world scale rather than fixed cell counts.

Enclosure can improve shelter, but increasingly narrow access is not automatically better for every activity. Bay identity, shelter, navigability and land access should not collapse into one universal quality score.

## 7. Shore access and potential exposure

Assess individual shoreline segments, including lake shores, rather than giving an entire region or peninsula one rating.

- **Potential exposure:** sample how much unobstructed water lies in several directions and how surrounding land blocks it. A peninsula tip can be exposed while its inner shore is sheltered. This is a geometric approximation, not simulated wind, waves or currents.
- **Immediate shoreline slope:** evaluate how sharply land rises above the relevant water surface over a short horizontal distance. A cliff-like boundary can be unsuitable for ordinary landing. Nearby mountain terrain alone is insufficient: a coastal strip or valley may still provide access. Use lake surface level for lake shores, rather than assuming sea level.
- **Usable frontage and ground:** distinguish a broad landing area from a tiny accessible opening.
- **Inland accessibility:** an easy water-to-land transition can still lead into a restricted valley or steep terrain.
- **Water approach:** distinguish geometrically sheltered water from an actually navigable approach. Do not present shoreline clearance as measured seabed depth.

Candidate qualitative labels are favourable, limited, difficult and unsuitable, accompanied by reasons such as “steep shore, narrow frontage, restricted inland access.” Thresholds remain provisional. Defenders, fleets and battle outcomes are separate from geographic suitability.

Natural-resource abundance must also remain separate from ease of exploitation. A sheltered, accessible bay may lower the difficulty/cost of water-based economic activity, but does not automatically create fish or other marine resources. Marine resource types and their production are still undesigned.

Proposed display: stable bay names in the ordinary map, plus an optional coastal-access/exposure overlay and an inspector explaining individual measurements. Port suitability and landing suitability can later interpret the same geographic inputs differently.

Physical inspiration, not a claim of full simulation: [FAO's fishing-harbour site guidance](https://www.fao.org/4/V5270E/v5270e01.htm) separates shelter, water depth and land access; [NOAA's wave explanation](https://oceanservice.noaa.gov/education/tutorial_currents/03coastal1.html) distinguishes fetch, wind strength and duration. Current/tide/surf modeling was not accepted for this work.

## 8. Map representation of economic and demographic development

The user approved this visual direction as a discussion foundation: retain the current natural landscape and let aggregate human activity appear through stable patterns, footprints and small illustrations matching the existing terrain/tree style.

**Rendered buildings are a visual expression of aggregate state, not separately simulated factories, homes or businesses.** Exact asset choices and rendering techniques remain open.

| Aggregate condition/activity | Candidate map expression |
| --- | --- |
| Sparse habitation | A few scattered roofs among fields and vegetation |
| Town | Compact roof clusters with a recognizable centre |
| Larger urban concentration | Continuous built-up footprint across neighbouring cells, with denser centres |
| Industry | Groups of larger sheds and yards, with occasional chimneys, distinct from residential patterns |
| Agriculture | Irregular cultivated patches following suitable terrain |
| Mining/quarrying | Exposed-earth workings, pits or cuts whose footprint reflects developed extraction |
| Oil extraction | Sparse recognizable structures where extraction actually occurs |

Developed area matters more than a literal icon count. A large industrial district can occupy a larger visible footprint rather than receiving one oversized factory icon. Illustrations must follow actual activity, land use and appropriate terrain; a resource deposit alone is not an operating extraction site.

Separate persistent development from current operation. An idle industrial district remains visible; reduced activity cues can distinguish it from an operating one. An economic downturn does not instantly demolish its buildings or erase its urban centre.

Population growth extends an existing visual pattern rather than randomly rearranging every roof each turn. Stable placements should remain coherent across turns and zoom. Neither exact density thresholds nor the method for grouping/naming centres has been frozen.

Zoom-dependent representation:

- World view: settlement names and broad urban concentrations.
- Intermediate terrain view: built-up footprints, fields, industrial areas and extraction sites.
- Close view: small structures providing character to those patterns.

Mostly static illustrations and land-use textures are the proposed first direction. Animated workers, traffic, individually maintained buildings and city-builder interactions are not needed.

## 9. Pollution presentation

Normal landscape presentation should remain readable. Avoid automatically covering all industry in heavy grey clouds or equating every chimney with a pollution level.

Where the simulation actually records severe environmental degradation, restrained changes such as damaged vegetation or ground colour could make it visible. A pollution overlay provides the clear quantitative view and an inspector provides exact values.

Water discoloration requires modeled water pollution. Downstream pollution graphics require actual transport/impact state; the renderer must not invent a polluted river merely because industry appears nearby. Pollution types, dispersion, recovery and visual thresholds remain open.

## 10. Handoff boundary

The next implementation discussion belongs in the dedicated Map Lab task, at the user's initiative. The near-term candidate scope is geographic interpretation and visuals: identify/name bays, assess shoreline characteristics and inspect results on generated maps. Migration and settlement remain intended game systems, but their prototype has not been authorized here.

No new bay detection, migration, urbanization, marine resource, pollution or activity renderer is claimed implemented by these notes. Preserve the distinction between accepted direction, proposed heuristic and demonstrated laboratory behavior.
