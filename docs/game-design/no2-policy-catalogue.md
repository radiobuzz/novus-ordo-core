# NO2 — extracted policy catalogue

Generated from the historical archive; original spelling, values and apparent mistakes are preserved.

Read [the analysis and caveats](no2-policy-extraction.md) before interpreting these fields. The [JSON extraction](data/no2-policy-catalogue.json) includes complete metadata, presets, source assignments and indicator formulas.

Source: `no/modules/legal/legal.params.php` in `no_old_backup_from_20100226.zip`. Line references below are archive-member line numbers, not current-game files. Original source notice: Copyright 2006 Frédéric Brown; GPL-2.0-or-later.

A **topic** is a policy question; a **measure** is one option. Radio topics select one option; checkboxes allow independent measures. “Default” reports the definition flag, not a guarantee that a starting preset selects it. Unlisted numeric effects are absent, not implicitly zero for every aggregation rule. Fields below are legacy inputs, not promised per-turn indicator changes.

| Domain | Topics | Options |
| --- | ---: | ---: |
| Constitution | 11 | 39 |
| Law and Order | 8 | 23 |
| Education | 13 | 50 |
| Health | 3 | 13 |
| Welfare | 1 | 4 |
| Environment | 1 | 6 |
| Infrastructure | 2 | 8 |
| Economy | 5 | 13 |
| Defense | 2 | 5 |

## Constitution (`constitution`)


### Emblems (`emblems`)

Independent checkboxes. Available by default. Source line 329.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `motto` | National Motto. | — | Input metadata: `{"national_motto": {"prompt": "Motto", "description": "National Motto", "shown_in_demography_state": true}}` | 331 |

### Restrictions over citizenship (`citizenship`)

Independent checkboxes. Available by default. Source line 337.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `gender` | Citizenship is denied to a certain gender. | — | `political_mod` = `0.5`; `freedom_mod` = `0.5` | 339 |
| `ethnic` | Citizenship is denied to members of certain ethnic groups. | — | `political_mod` = `0.5`; `freedom_mod` = `0.5` | 344 |
| `religion` | Citizenship is denied to members of certain religions. | — | `political_mod` = `0.75`; `freedom_mod` = `0.75` | 349 |
| `test` | Citizenship is denied to those who fail a citizenship test. | — | `political_mod` = `0.75`; `freedom_mod` = `0.75` | 354 |

### Basic Law (`basic_law`)

Exclusive choice (radio). Available by default. Source line 359.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `arbitrary` | The power is exercised in an arbitrary fashion. | Yes | `legal_pos` = `-5` | 361 |
| `conventions` | The power is exercised following unwritten conventions. The Judiciary Branch enforces Judicial Review to ensure government conformance with the Law. | — | `legal_pos` = `1`; Unlocks: `judiciary`, `neg_rights` | 365 |
| `constitution` | The power is exercised according to the provisions of a written Constitution. The Judiciary Branch enforces Judicial Review to ensure government conformance with the Law and constitutionality of laws enacted. | — | `legal_pos` = `2`; Unlocks: `judiciary`, `neg_rights` | 372 |

### Appointment of the Head of State (`hos_appointment`)

Exclusive choice (radio). Available by default. Source line 379.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `hereditary` | The Head of State is hereditary. | Yes | `hos_political_pos` = `-5`; `hos_appointment` = `"hereditary"` | 381 |
| `installed` | The Head of State was installed by the Army. | — | `hos_political_pos` = `-5`; `hos_appointment` = `"installed by the Army"` | 386 |
| `appointed_elite` | The Head of State is appointed by a small elite. | — | `hos_political_pos` = `0`; `hos_appointment` = `"appointed by a small elite"` | 390 |
| `appointed` | The Head of State is appointed by the Legislature. | — | `hos_political_pos` = `0`; `hos_appointment` = `"appointed by the Legislature"` | 394 |
| `elected` | The Head of State is elected. | — | `hos_political_pos` = `5`; `hos_appointment` = `"elected"` | 398 |

### Executive Branch (`executive`)

Exclusive choice (radio). Available by default. Source line 402.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `both` | The Head of State is also Head of Government and exerts executive power. | Yes | `hos_political_mod` = `1` | 404 |
| `separate` | The Head of State exerts executive power along the Head of Government. | — | `hos_political_mod` = `0.5`; Unlocks: `hog_appointment` | 408 |
| `symbolic` | The Head of State is a a symbolic figurehead with reserve powers. The Head of Government exerts executive power. | — | `hos_political_mod` = `0.1`; Unlocks: `hog_appointment` | 413 |
| `ceremonial` | The Head of State is a a symbolic figurehead playing a ceremonial role. The Head of Government exerts executive power. | — | `political_pos` = `0`; `hos_political_mod` = `0`; Unlocks: `hog_appointment` | 418 |

### Appointment of the Head of Government (`hog_appointment`)

Exclusive choice (radio). Requires an enabling measure. Source line 424.

Topic input metadata: `{"hog_name": {"prompt": "Title of the Head of Government"}}`.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `hereditary` | The Head of Government is hereditary. | Yes | `hog_political_pos` = `-5`; Input metadata: `{"hog_name": {"description": "Head of Government (hereditary)", "shown_in_demography_state": true}}` | 429 |
| `appointed_hos` | The Head of Government is appointed by the Head of State. | — | `hog_political_pos` = `0`; Input metadata: `{"hog_name": {"description": "Head of Government (appointed by the Head of State)", "shown_in_demography_state": true}}` | 435 |
| `installed` | The Head of Government was installed by the Army. | — | `hog_political_pos` = `-5`; Input metadata: `{"hog_name": {"description": "Head of Government (installed by the Army)", "shown_in_demography_state": true}}` | 440 |
| `appointed_legislature` | The Head of Government is appointed by the Legislature. | — | `hog_political_pos` = `0`; Input metadata: `{"hog_name": {"description": "Head of Government (appointed by the Legislature)", "shown_in_demography_state": true}}` | 445 |
| `elected` | The Head of Government is elected. | — | `hog_political_pos` = `5`; Input metadata: `{"hog_name": {"description": "Head of Government (elected)"}}` | 450 |

### Legislative Branch (`legislature`)

Exclusive choice (radio). Available by default. Source line 454.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none_hos` | There is no Legislature. The Head of State exerts legislative power. | Yes | `political_pos` = `-5` | 456 |
| `none_hog` | There is no Legislature. The Head of Government exerts legislative power. | — | `political_pos` = `-5` | 460 |
| `separate` | There is a legislative body. | — | `political_pos` = `0`; Unlocks: `legislature_appointment` | 463 |

### Appointment of the Legislative Branch (`legislature_appointment`)

Exclusive choice (radio). Requires an enabling measure. Source line 468.

Topic input metadata: `{"legislature_name": {"prompt": "Name of the Legislature"}}`.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `ceremonial` | Members of the Legislature are appointed by the Head of State and play a ceremonial role. | Yes | `political_pos` = `0`; Input metadata: `{"legislature_name": {"description": "Legislature (ceremonial body appointed by the Head of State)", "shown_in_demography_state": true}}` | 473 |
| `appointed` | Members of the Legislature are appointed by the Head of State. | — | `political_pos` = `1`; Input metadata: `{"legislature_name": {"description": "Legislature (appointed by the Head of State)"}}` | 479 |
| `elite` | Members of the Legislature are members of a small elite. | — | `political_pos` = `5`; Input metadata: `{"legislature_name": {"description": "Legislature (membership restricted to a small elite)", "shown_in_demography_state": true}}` | 483 |
| `elected` | Members of the Legislature are elected. | — | `political_pos` = `20`; Input metadata: `{"legislature_name": {"description": "Legislature (elected)", "shown_in_demography_state": true}}` | 488 |

### Judiciary Branch (`judiciary`)

Exclusive choice (radio). Requires an enabling measure. Source line 493.

Topic input metadata: `{"judiciary_name": {"prompt": "Name of the Judiciary Branch"}}`.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `reports_hos` | The Judiciary Branch exerts judiciary power but sees its decisions reviewed by the Head of State. | Yes | `legal_pos` = `0`; Input metadata: `{"judiciary_name": {"description": "Judiciary Branch (reports to the Head of State)", "shown_in_demography_state": true}}` | 498 |
| `reports_legislature` | The Judiciary Branch exerts judiciary power but sees its decisions reviewed by the Legislature. | — | `legal_pos` = `5`; Input metadata: `{"judiciary_name": {"description": "Judiciary Branch (reports to the Legislature)", "shown_in_demography_state": true}}` | 504 |
| `independent` | The Judiciary is an independent branch. | — | `legal_pos` = `10`; Input metadata: `{"judiciary_name": {"description": "Name of the Judiciary Branch", "shown_in_demography_state": true}}` | 509 |

### State Religion (`state_religion`)

Exclusive choice (radio). Available by default. Source line 514.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `secular` | The state is secular. | Yes | `freedom_pos` = `1.5` | 516 |
| `atheism` | Atheism is an official doctrine. | — | `freedom_pos` = `0` | 520 |
| `religion` | There is a state religion. | — | `freedom_pos` = `0`; Input metadata: `{"religion_name": {"prompt": "Name of the State Religion", "description": "State Religion", "shown_in_demography_state": true}}` | 523 |

### Negative Rights (`neg_rights`)

Independent checkboxes. Requires an enabling measure. Source line 529.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `cons` | Freedom of conscience | — | `freedom_pos` = `3` | 532 |
| `speech` | Freedom of speech | — | `freedom_pos` = `6` | 539 |
| `assoc` | Freedom of association | — | `freedom_pos` = `9` | 546 |
| `press` | Freedom of press | — | `freedom_pos` = `15`; `show_news` = `1` | 553 |

## Law and Order (`order`)


### Presumption of innocence (`innocence`)

Exclusive choice (radio). Available by default. Source line 601.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `not_recognized` | Presumption of innocence is not recognized. | Yes | `ci_peak_dec` = `0.05`; `freedom_pos` = `0` | 603 |
| `recognized` | Presumption of innocence is recognized. Any person charged with an offence is presumed innocent until proven guilty. | — | `freedom_pos` = `5` | 608 |

### Habeas corpus (`habeascorpus`)

Exclusive choice (radio). Available by default. Source line 611.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `not_recognized` | The police can hold suspects indefinitely. | Yes | `ci_peak_dec` = `-0.05`; `freedom_pos` = `0` | 613 |
| `recognized` | A suspect must be released from custody within 48 hours unleast charges are retained against her or him. | — | `freedom_pos` = `5` | 618 |

### Death penalty (`death_penality`)

Exclusive choice (radio). Available by default. Source line 621.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `never` | Death penalty is never applied. | Yes | `freedom_pos` = `2` | 623 |
| `major` | Death penalty is applied for major offenses such as serial murdering, crimes against humanity and high treason. | — | `ci_peak_dec` = `-0.01`; `freedom_pos` = `1.5` | 627 |
| `capital` | Death penalty is applied for murder. | — | `ci_peak_dec` = `-0.02`; `freedom_pos` = `0.5` | 631 |
| `most` | Death penalty is applied for most offenses. | — | `ci_peak_dec` = `-0.05`; `freedom_pos` = `0` | 635 |

### Law enforcement agencies (`law_enforcement_agencies`)

Independent checkboxes. Available by default. Source line 639.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `local` | Municipalities have a local police department. | — | `cost_police` = `300`; `tax_treshold` = `0.03`; `ci_peak_dec` = `-0.3` | 641 |
| `national` | There is a national law enforcement agency. | — | `cost_police` = `100`; `tax_treshold` = `0.01`; `ci_peak_dec` = `-0.1`; Input metadata: `{"law_agency_name": {"prompt": "Agency name", "description": "National Law Enforcement Agency"}}` | 647 |

### Forensics (`forensics`)

Exclusive choice (radio). Available by default. Source line 655.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | The police does not rely on forensic science. | Yes | No additional fields | 657 |
| `occasional` | The police relies on forensics specialists occasionally, when they must solve a very complex case. | — | `cost_police` = `25`; `tax_treshold` = `0.0025`; `ci_peak_dec` = `-0.0125` | 660 |
| `limited` | The police maintains forensics laboratories. | — | `cost_police` = `50`; `tax_treshold` = `0.005`; `ci_peak_dec` = `-0.025` | 665 |
| `violent_crimes` | The police maintains well staffed, state of the art forensics laboratories and relies on forensic science to solve violent crimes. | — | `cost_police` = `100`; `tax_treshold` = `0.01`; `ci_peak_dec` = `-0.05` | 670 |
| `most_crimes` | The police maintains well staffed, state of the art forensics laboratories and relies on forensic science to solve most cases. | — | `cost_police` = `150`; `tax_treshold` = `0.015`; `ci_peak_dec` = `-0.075` | 675 |

### Tactical team (`tactical`)

Independent checkboxes. Available by default. Source line 680.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `local` | Major cities' police departments maintain a special response team. | — | `cost_police` = `150`; `tax_treshold` = `0.015`; `ci_peak_dec` = `-0.075` | 682 |
| `national` | There is national special response team backing local police and fighting terrorism. | — | `cost_police` = `50`; `tax_treshold` = `0.005`; `ci_peak_dec` = `-0.025` | 688 |

### Identification cards (`id_cards`)

Exclusive choice (radio). Available by default. Source line 694.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `not_required` | Nobody is required to carry any identification card. | Yes | `freedom_pos` = `0` | 696 |
| `limited_use` | Everyone is required to carry its government issued identification card at all time. However, it is used solely by law enforcement to ease identification on crime scenes. Failure to produce it when requested to by a law enforcement officer is a minor, fined offense. | — | `cost_police` = `25`; `ci_peak_dec` = `-0.0125`; `freedom_pos` = `-1` | 700 |
| `extensive_use` | Everyone is required to carry its government issued identification card at all time. Failure to produce it when requested to by a law enforcement officer is a criminal offense. | — | `cost_police` = `25`; `ci_peak_dec` = `-0.025`; `freedom_pos` = `-3` | 705 |

### Curfew (`curfew`)

Exclusive choice (radio). Available by default. Source line 710.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | No curfew may be established. | Yes | `freedom_pos` = `0` | 712 |
| `occasional` | Curfews are established periodically, when needed to support law enforcement activities. | — | `cost_police` = `25`; `ci_peak_dec` = `-0.0125`; `freedom_pos` = `-1` | 716 |
| `permanent` | Curfews are permanently established in every cities. Using streets or public property beyond curfew time is a criminal offense. | — | `cost_police` = `100`; `ci_peak_dec` = `-0.025`; `freedom_pos` = `-2` | 721 |

## Education (`education`)


### Curriculum (`curriculum`)

Exclusive choice (radio). Available by default. Source line 732.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | The government does not impose a curriculum to educational institutions. | Yes | No additional fields | 734 |
| `public` | The government imposes a curriculum to public educational institutions. Private educational institutions are exempted. | — | `li_mod` = `1.05`; `cost_education_mod` = `1.05` | 737 |
| `public_and_private` | The government imposes a curriculum to every public and private educational institutions. | — | `li_mod` = `1.05`; `cost_education_mod` = `1.05`; `economic_pos` = `0.25` | 741 |

### Kindergartens (`kindergarten`)

Exclusive choice (radio). Available by default. Source line 748.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private_only` | The government does not fund any kindergarten. The preschool education market is left to the private sector. | Yes | `cost_education_kindergarten_mod` = `1.1`; Unlocks: `kindergarten_tuition`, `private_religious_schools` | 750 |
| `public_and_private` | The government funds public kindergartens. The private sector is allowed to setup kindergartens. | — | `economic_pos` = `0.125`; Unlocks: `kindergarten_tuition`, `private_religious_schools` | 759 |
| `public` | The government funds public kindergartens. Private kindergartens are banned. | — | `cost_education_kindergarten_mod` = `0.9`; `economic_pos` = `0.25`; Unlocks: `kindergarten_tuition` | 766 |
| `none` | Preschool education is banned. | — | `li_peak_dec` = `-0.075`; `freedom_pos` = `-0.075`; `social_pos` = `-0.25` | 774 |

### Tuition (kindergartens) (`kindergarten_tuition`)

Exclusive choice (radio). Requires an enabling measure. Source line 780.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | The government does not subsides kindergartens in any way. | Yes | `cost_education_kindergarten` = `0`; `social_pos` = `0` | 783 |
| `partial` | Tuition is partially subsided by the government. | — | `li_peak_inc` = `0.0375`; `cost_education_kindergarten` = `125`; `tax_treshold` = `0.01`; `social_pos` = `0.125` | 790 |
| `high` | Tuition is highly subsided by the government. | — | `li_peak_inc` = `0.0625`; `cost_education_kindergarten` = `250`; `tax_treshold` = `0.02`; `social_pos` = `0.25` | 797 |
| `full` | Tuition is fully subsided by the government. | — | `li_peak_inc` = `0.09375`; `cost_education_kindergarten` = `375`; `tax_treshold` = `0.025`; `social_pos` = `0.5` | 805 |

### Primary education (`primary`)

Exclusive choice (radio). Available by default. Source line 815.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private_only` | The government does not fund any elementary school. The primary education market is left to the private sector. | Yes | `cost_education_primary_mod` = `1.1`; Unlocks: `primary_tuition`, `private_religious_schools` | 817 |
| `public_and_private` | The government funds public elementary schools. The private sector is allowed to setup elementary schools. | — | `economic_pos` = `0.5`; Unlocks: `primary_tuition`, `private_religious_schools` | 827 |
| `public` | The government funds public elementary schools. Private elementary schools are banned. | — | `cost_education_primary_mod` = `0.9`; `economic_pos` = `1`; Unlocks: `primary_tuition` | 834 |
| `none` | Primary education is banned. | — | `li_peak_dec` = `-0.3`; `freedom_pos` = `-0.3`; `social_pos` = `-1` | 842 |

### Tuition (primary) (`primary_tuition`)

Exclusive choice (radio). Requires an enabling measure. Source line 847.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | The government does not subsides elementary schools in any way. | Yes | `cost_education_primary` = `0`; `social_pos` = `0` | 850 |
| `partial` | Tuition is partially subsided by the government. | — | `li_peak_inc` = `0.125`; `cost_education_primary` = `500`; `tax_treshold` = `0.04`; `social_pos` = `0.5` | 857 |
| `high` | Tuition is highly subsided by the government. | — | `li_peak_inc` = `0.25`; `cost_education_primary` = `1000`; `tax_treshold` = `0.07`; `social_pos` = `1` | 864 |
| `full` | Tuition is fully subsided by the government. | — | `li_peak_inc` = `0.375`; `cost_education_primary` = `1500`; `tax_treshold` = `0.1`; `social_pos` = `2` | 872 |

### Secondary education (`secondary`)

Exclusive choice (radio). Available by default. Source line 882.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private_only` | The government does not fund any high school. The secondary education market is left to the private sector. | Yes | `cost_education_primary_mod` = `1.1`; Unlocks: `secondary_tuition`, `private_religious_schools` | 884 |
| `public_and_private` | The government funds public high schools. The private sector is allowed to setup high schools. | — | `economic_pos` = `0.5`; Unlocks: `secondary_tuition`, `private_religious_schools` | 894 |
| `public` | The government funds public high schools. Private high schools are banned. | — | `cost_education_secondary_mod` = `0.9`; `economic_pos` = `1`; Unlocks: `secondary_tuition` | 901 |
| `none` | Secondary education is banned. | — | `li_peak_dec` = `-0.3`; `freedom_pos` = `-0.3`; `social_pos` = `-1` | 909 |

### Tuition (secondary) (`secondary_tuition`)

Exclusive choice (radio). Requires an enabling measure. Source line 915.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | The government does not subsides high schools in any way. | Yes | `cost_education_secondary` = `0`; `social_pos` = `0` | 918 |
| `partial` | Tuition is partially subsided by the government. | — | `li_peak_inc` = `0.125`; `cost_education_secondary` = `500`; `tax_treshold` = `0.04`; `social_pos` = `0.5` | 925 |
| `high` | Tuition is highly subsided by the government. | — | `li_peak_inc` = `0.25`; `cost_education_secondary` = `1000`; `tax_treshold` = `0.07`; `social_pos` = `1` | 932 |
| `full` | Tuition is fully subsided by the government. | — | `li_peak_inc` = `0.375`; `cost_education_secondary` = `1500`; `tax_treshold` = `0.1`; `social_pos` = `2` | 940 |

### Vocational education (`vocational`)

Exclusive choice (radio). Available by default. Source line 950.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private_only` | The government does not fund any college or polytechnic. The vocational education market is left to the private sector. | Yes | `cost_education_vocational_mod` = `1.1`; Unlocks: `vocational_tuition`, `private_religious_schools` | 952 |
| `public_and_private` | The government funds colleges and polytechnics. The private sector is allowed to setup colleges and polytechnics. | — | `economic_pos` = `0.25`; Unlocks: `vocational_tuition`, `private_religious_schools` | 962 |
| `public` | The government funds public colleges and polytechnics. Private colleges and polytechnics are banned. | — | `cost_education_vocational_mod` = `0.9`; `economic_pos` = `0.5`; Unlocks: `vocational_tuition` | 969 |
| `none` | Vocational education is banned. | — | `li_peak_dec` = `-0.15`; `freedom_pos` = `-0.15`; `social_pos` = `-0.5` | 977 |

### Tuition (vocational) (`vocational_tuition`)

Exclusive choice (radio). Requires an enabling measure. Source line 982.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | The government does not subsides colleges or polytechnics in any way. | Yes | `cost_education_vocational` = `0`; `social_pos` = `0` | 985 |
| `partial` | Tuition is partially subsided by the government. | — | `li_peak_inc` = `0.0625`; `cost_education_vocational` = `250`; `tax_treshold` = `0.02`; `social_pos` = `0.25` | 992 |
| `high` | Tuition is highly subsided by the government. | — | `li_peak_inc` = `0.125`; `cost_education_vocational` = `500`; `tax_treshold` = `0.04`; `economic_pos` = `0.5` | 999 |
| `full` | Tuition is fully subsided by the government. | — | `li_peak_inc` = `0.1875`; `cost_education_vocational` = `750`; `tax_treshold` = `0.05`; `social_pos` = `1` | 1007 |

### Higher education (`higher`)

Exclusive choice (radio). Available by default. Source line 1017.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private_only` | The government does not fund any university. The higher education market is left to the private sector. | Yes | `cost_education_higher_mod` = `1.1`; Unlocks: `higher_tuition`, `private_religious_schools` | 1019 |
| `public_and_private` | The government funds universities. The private sector is allowed to setup universities. | — | `economic_pos` = `0.25`; Unlocks: `higher_tuition`, `private_religious_schools` | 1029 |
| `public` | The government funds public universities. Private universities are banned. | — | `cost_education_higher_mod` = `0.9`; `economic_pos` = `0.5`; Unlocks: `higher_tuition` | 1036 |
| `none` | Higher education is banned. | — | `li_peak_dec` = `-0.15`; `freedom_pos` = `-0.15`; `social_pos` = `-0.5` | 1044 |

### Tuition (higher) (`higher_tuition`)

Exclusive choice (radio). Requires an enabling measure. Source line 1049.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | The government does not subsides universities in any way. | Yes | `cost_education_higher` = `0`; `social_pos` = `0` | 1052 |
| `partial` | Tuition is partially subsided by the government. | — | `li_peak_inc` = `0.0625`; `cost_education_higher` = `250`; `tax_treshold` = `0.02`; `social_pos` = `0.25` | 1059 |
| `high` | Tuition is highly subsided by the government. | — | `li_peak_inc` = `0.125`; `cost_education_higher` = `500`; `tax_treshold` = `0.04`; `social_pos` = `0.5` | 1066 |
| `full` | Tuition is fully subsided by the government. | — | `li_peak_inc` = `0.1875`; `cost_education_higher` = `750`; `tax_treshold` = `0.05`; `social_pos` = `1` | 1074 |

### Religion in public educational institutions (`public_religious_schools`)

Exclusive choice (radio). Available by default. Source line 1084.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `secular` | Public educational institutions are secular. | Yes | `freedom_pos` = `1.5` | 1086 |
| `religious` | Public educational institutions are religious. Any religious group in sufficient number can have access to education in its religion. | — | `freedom_pos` = `0.5` | 1090 |
| `religious_recognised` | Public educational institutions are religious. Only recognised religions have educational institutions. | — | `freedom_pos` = `0` | 1093 |
| `ban` | Religion is forbiden in public educational institutions. | — | `freedom_pos` = `0` | 1096 |

### Religion in private educational institutions (`private_religious_schools`)

Exclusive choice (radio). Requires an enabling measure. Source line 1099.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `any` | Any religion can set up educational institutions. | Yes | `freedom_pos` = `1.5` | 1102 |
| `recognised` | Only recognised religions can set up educational institutions. | — | `freedom_pos` = `0.5` | 1106 |
| `ban` | Religious educational institutions are banned. | — | `freedom_pos` = `0` | 1109 |

## Health (`health`)


### Hospitals (`hospitals`)

Exclusive choice (radio). Available by default. Source line 1115.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private_only` | The government does not fund any hospital. The hospital inpatient market is left to the private sector. | Yes | `cost_health_mod` = `1.1`; Unlocks: `health_insurance` | 1117 |
| `public_and_private` | The government funds public hospitals. The private sector is allowed to setup hospitals as well. | — | `economic_pos` = `1`; Unlocks: `health_insurance` | 1125 |
| `public` | The government funds public hospitals. Private hospitals are banned. | — | `cost_health_mod` = `0.9`; `economic_pos` = `2`; Unlocks: `health_insurance` | 1131 |
| `none` | Hospitals are banned. | — | `hi_peak_dec` = `-0.5`; `social_pos` = `-2`; `freedom_pos` = `-0.25` | 1139 |

### Health insurance (`health_insurance`)

Exclusive choice (radio). Requires an enabling measure. Source line 1144.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private` | Health insurance is left to the private sector. | Yes | `cost_health` = `0`; `social_pos` = `-2` | 1147 |
| `public_few` | Fees covered by public health insurance are few. | — | `hi_peak_inc` = `0.25`; `cost_health` = `1250`; `tax_treshold` = `0.075`; `social_pos` = `1` | 1153 |
| `public_some` | Public health insurance covers some of the fees. | — | `hi_peak_inc` = `0.5`; `cost_health` = `2500`; `tax_treshold` = `0.15`; `economic_pos` = `0.5`; `social_pos` = `2` | 1159 |
| `public` | Public health insurance is accessible to everyone and covers most of the fees. | — | `hi_peak_inc` = `0.75`; `cost_health` = `3750`; `tax_treshold` = `0.225`; `economic_pos` = `1`; `social_pos` = `3` | 1166 |
| `universal` | Healthcare is universal and completely free. | — | `hi_peak_inc` = `1.0`; `cost_health` = `5000`; `tax_treshold` = `0.3`; `economic_pos` = `2`; `social_pos` = `5` | 1175 |

### Unhealthy food (`unhealthy_food`)

Exclusive choice (radio). Available by default. Source line 1184.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | There is no regulation over unhealthy food. | Yes | No additional fields | 1186 |
| `public_ban` | Unhealthy food is banned from public institutions. | — | `hi_peak_inc` = `0.01`; `cost_health` = `50` | 1189 |
| `regulation` | Unhealthy food is banned from public institutions. The government imposes regulation over food served in restaurants. | — | `hi_peak_inc` = `0.05`; `cost_health` = `250` | 1193 |
| `ban` | Unhealthy food is banned. | — | `hi_peak_inc` = `0.075`; `cost_health` = `350`; `freedom_pos` = `-0.05`; `economic_pos` = `-0.25` | 1197 |

## Welfare (`welfare`)


### Financial assistance (`assistance`)

Exclusive choice (radio). Available by default. Source line 1206.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | The government doesn't pay any financial assistance. | Yes | `social_pos` = `-2` | 1208 |
| `workfare_only` | The government establishes workfare programs. There is no direct cash payment, even to disabled persons. | — | `gi_peak_dec` = `-0.1`; `cost_welfare` = `500`; `tax_treshold` = `0.03`; `economic_pos` = `0.5`; `social_pos` = `-1` | 1214 |
| `workfare` | The government establishes workfare programs. However, direct aid is provided to persons with disabilities. | — | `gi_peak_dec` = `-0.4`; `cost_welfare` = `2000`; `tax_treshold` = `0.13`; `economic_pos` = `2`; `social_pos` = `2` | 1222 |
| `minimal_income` | The government guarantees a minimal income to persons unable to sustain themselves. | — | `gi_peak_dec` = `-0.6`; `cost_welfare` = `3000`; `tax_treshold` = `0.2`; `economic_pos` = `3`; `social_pos` = `3` | 1230 |

## Environment (`environment`)


### Polution standards (`polution_standards`)

Exclusive choice (radio). Available by default. Source line 1241.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `no` | The government doesn't enforce any polution standard. | Yes | No additional fields | 1243 |
| `some` | The government imposes a very limited number of polution standards. | — | `ei_peak_dec` = `-0.01875`; `ni_peak_inc` = `0.1`; `cost_environment` = `100`; `economic_pos` = `0.25` | 1246 |
| `mild` | The government imposes mild polution standards. | — | `ei_peak_dec` = `-0.0375`; `ni_peak_inc` = `0.2`; `cost_environment` = `250`; `economic_pos` = `0.5` | 1253 |
| `strict` | The government imposes strict polution standards. | — | `ei_peak_dec` = `-0.075`; `ni_peak_inc` = `0.4`; `cost_environment` = `500`; `economic_pos` = `2.0` | 1260 |
| `stricter` | The government imposes stricter polution standards. | — | `ei_peak_dec` = `-0.1125`; `ni_peak_inc` = `0.6`; `cost_environment` = `750`; `economic_pos` = `1.5` | 1267 |
| `severe` | The government imposes very severe polution standards. | — | `ei_peak_dec` = `-0.15`; `ni_peak_inc` = `0.8`; `cost_environment` = `1000` | 1273 |

## Infrastructure (`infrastructure`)


### Infrastructure maintenance and expansion (`maintenance`)

Exclusive choice (radio). Available by default. Source line 1283.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private_only` | Infrastructure is maintained and expanded by the private sector. | Yes | `cost_infrastructure_mod` = `1.1` | 1285 |
| `private_and_public` | The government manages major infrastructure projects. However, it outsource some parts to private subcontractors. | — | `economic_pos` = `0.5` | 1290 |
| `public` | The government manages directly every infrastructure project. | — | `cost_infrastructure_mod` = `0.9`; `economic_pos` = `1` | 1293 |

### Infrastructure investment (`investment`)

Exclusive choice (radio). Available by default. Source line 1298.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | The government doesn't invest in infrastructure. | Yes | No additional fields | 1300 |
| `minimal` | The government investment level in infrastructure is minimal. | — | `ii_peak_inc` = `0.25`; `cost_infrastructure` = `500`; `tax_treshold` = `0.04` | 1303 |
| `moderate` | The government investment level in infrastructure is moderate. | — | `ii_peak_inc` = `0.5`; `cost_infrastructure` = `1000`; `tax_treshold` = `0.08` | 1309 |
| `high` | The government investment level in infrastructure is high. | — | `ii_peak_inc` = `0.75`; `cost_infrastructure` = `1500`; `tax_treshold` = `0.08` | 1315 |
| `very_high` | The government investment level in infrastructure is very high. | — | `ii_peak_inc` = `1.0`; `cost_infrastructure` = `2000`; `tax_treshold` = `0.08` | 1321 |

## Economy (`economy`)


### Monetary policy (`currency`)

Exclusive choice (radio). Available by default. Source line 1329.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `none` | The Standard Dollar is legal tender. | Yes | No additional fields | 1331 |
| `own_currency` | The government issue its own national currency. | — | Input metadata: `{"currency": {"prompt": "Name of the currency", "description": "Currency"}}` | 1334 |

### Primary sector of industry (mines, farms, ressource gathering, etc.) (`primary`)

Exclusive choice (radio). Available by default. Source line 1339.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private` | Ressource gathering is left to the private sector. | Yes | No additional fields | 1341 |
| `private_and_state` | Some primary sector enterprises are owned by the State while other are privately owned. | — | `economic_pos` = `1.5` | 1345 |
| `state` | Ressource gathering is a nationalized sector. | — | `economic_pos` = `3` | 1348 |

### Secondary sector of industry (finished goods, construction, etc.) (`secondary`)

Exclusive choice (radio). Available by default. Source line 1351.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private` | Secondary sector industries are privately owned. | Yes | No additional fields | 1353 |
| `private_and_state` | Some secondary sector enterprises are owned by the State while other are privately owned. | — | `economic_pos` = `3`; Unlocks: `prioritization` | 1357 |
| `state` | Production is a nationalized sector. | — | `economic_pos` = `6`; Unlocks: `prioritization` | 1361 |

### Prioritization of the industrial output (`prioritization`)

Exclusive choice (radio). Requires an enabling measure. Source line 1365.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `goods` | Consumer goods are prioritized to support economic development. | Yes | `ic_support_ratio` = `0` | 1368 |
| `heavy` | Heavy industry is prioritized to increase industrial output and support war effort. | — | `ic_support_ratio` = `1` | 1372 |

### Tertiary sector of industry (services, research, information technology, etc.) (`tertiary`)

Exclusive choice (radio). Available by default. Source line 1375.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `private` | Tertiary sector industries are privately owned. | Yes | No additional fields | 1377 |
| `private_and_state` | Some tertiary sector enterprises are owned by the State while other are privately owned. | — | `economic_pos` = `2.25` | 1381 |
| `state` | Services are a nationalized sector. | — | `economic_pos` = `4.5` | 1384 |

## Defense (`defense`)


### Military readiness (`strengh`)

Exclusive choice (radio). Available by default. Source line 1390.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `full` | Wartime readiness, divisions are fully operational. | Yes | `military_defense_efficiency_mod` = `1`; `military_attack_efficiency_mod` = `1`; `military_cost_mod` = `1.0` | 1392 |
| `peace` | Peacetime readiness, divisions in normal status. | — | `military_defense_efficiency_mod` = `0.85`; `military_attack_efficiency_mod` = `0.75`; `military_cost_mod` = `0.75` | 1398 |
| `half` | Peacetime readiness, divisions in half strength status. | — | `military_defense_efficiency_mod` = `0.5`; `military_attack_efficiency_mod` = `0.5`; `military_cost_mod` = `0.5` | 1403 |

### Military specialization (`military_specialization`)

Exclusive choice (radio). Available by default. Source line 1408.

| Option | Original description | Default | Fields and dependencies | Source line |
| --- | --- | --- | --- | ---: |
| `both` | The country has a general purpose military. | Yes | `military_defense_efficiency_mod` = `1.0`; `military_attack_efficiency_mod` = `1.0`; `military_cost` = `1.0` | 1410 |
| `defense` | The country has a defensive military. | — | `military_defense_efficiency_mod` = `1.0`; `military_attack_efficiency_mod` = `0.5`; `military_cost_mod` = `0.75` | 1416 |

## Reform packages

Packages replace the selection in each listed topic. An empty selection clears that topic; the optional fourth value `true` means add without replacing other selections. Three tax reforms call dedicated functions instead of setting catalogue measures. Hidden packages remain available to other game flows.

### Form of government (`government`)

- **Establish an absolute monarchy** (`absolute_monarchy`; line 1440; shown).
  `constitution/basic_law` → `"arbitrary"` (replace); `constitution/hos_appointment` → `"hereditary"` (replace); `constitution/executive` → `"both"` (replace); `constitution/hog_appointment` → `[]` (replace); `constitution/legislature` → `"none_hos"` (replace); `constitution/legislature_appointment` → `[]` (replace); `constitution/judiciary` → `[]` (replace); `constitution/neg_rights` → `[]` (replace).

- **Establish a military junta** (`junta`; line 1443; shown).
  `constitution/basic_law` → `"arbitrary"` (replace); `constitution/hos_appointment` → `"installed"` (replace); `constitution/executive` → `"both"` (replace); `constitution/hog_appointment` → `[]` (replace); `constitution/legislature` → `"none_hos"` (replace); `constitution/legislature_appointment` → `[]` (replace); `constitution/judiciary` → `[]` (replace); `constitution/neg_rights` → `[]` (replace).

- **Establish an authoritarian republic** (`authoritarian_republic`; line 1446; shown).
  `constitution/basic_law` → `"constitution"` (replace); `constitution/hos_appointment` → `"appointed"` (replace); `constitution/executive` → `"ceremonial"` (replace); `constitution/hog_appointment` → `"appointed_legislature"` (replace); `constitution/legislature` → `"separate"` (replace); `constitution/legislature_appointment` → `"elite"` (replace); `constitution/judiciary` → `"independent"` (replace).

- **Establish a constitutional monarchy** (`constitutional_monarchy`; line 1449; shown).
  `constitution/basic_law` → `"conventions"` (replace); `constitution/hos_appointment` → `"hereditary"` (replace); `constitution/executive` → `"symbolic"` (replace); `constitution/hog_appointment` → `"appointed_legislature"` (replace); `constitution/legislature` → `"separate"` (replace); `constitution/legislature_appointment` → `"elected"` (replace); `constitution/judiciary` → `"independent"` (replace).

- **Establish a parliamentary democracy** (`parlementary_democracy`; line 1452; shown).
  `constitution/basic_law` → `"constitution"` (replace); `constitution/executive` → `"ceremonial"` (replace); `constitution/hog_appointment` → `"appointed_legislature"` (replace); `constitution/legislature` → `"separate"` (replace); `constitution/legislature_appointment` → `"elected"` (replace); `constitution/judiciary` → `"independent"` (replace).

- **Establish a presidential democracy** (`presidential_democracy`; line 1455; shown).
  `constitution/basic_law` → `"constitution"` (replace); `constitution/hos_appointment` → `"elected"` (replace); `constitution/executive` → `"both"` (replace); `constitution/hog_appointment` → `[]` (replace); `constitution/legislature` → `"separate"` (replace); `constitution/legislature_appointment` → `"elected"` (replace); `constitution/judiciary` → `"independent"` (replace).

### Civil rights (`rights`)

- **Abolish civil rights and judicial review** (`abolish_rights`; line 1460; shown).
  `constitution/basic_law` → `"arbitrary"` (replace); `constitution/judiciary` → `[]` (replace); `constitution/neg_rights` → `[]` (replace); `order/innocence` → `"not_recognized"` (replace); `order/habeascorpus` → `"not_recognized"` (replace).

- **Create an independent judiciary** (`create_judiciary`; line 1463; hidden).
  `constitution/basic_law` → `"constitution"` (replace); `constitution/judiciary` → `"independent"` (replace).

- **Instate judicial review to guarantee civil rights** (`grant_rights`; line 1467; shown).
  `constitution/citizenship` → `[]` (replace); `constitution/basic_law` → `"constitution"` (replace); `constitution/judiciary` → `"independent"` (replace); `constitution/neg_rights` → `["cons", "speech", "assoc", "press"]` (replace); `order/innocence` → `"recognized"` (replace); `order/habeascorpus` → `"recognized"` (replace).

- **Conventions regognize judicial review and guarantee civil rights** (`grant_rights_conventions`; line 1470; hidden).
  `constitution/basic_law` → `"conventions"` (replace); `constitution/judiciary` → `"independent"` (replace); `constitution/neg_rights` → `["cons", "speech", "assoc", "press"]` (replace); `order/innocence` → `"recognized"` (replace); `order/habeascorpus` → `"recognized"` (replace).

### Economy (`economy`)

- **Cut taxes** (`tax_cut`; line 1477; shown).
  Custom handler: `["Legal_Functions", "enact_tax_cut"]`.

- **Set taxes between balance and maximal revenue** (`half_income`; line 1482; hidden).
  Custom handler: `["Legal_Functions", "enact_half_income"]`.

- **Raise taxes to maximize revenues** (`max_income`; line 1488; shown).
  Custom handler: `["Legal_Functions", "enact_max_income"]`.

- **Privatize public services** (`private_welfare`; line 1493; shown).
  `infrastructure/maintenance` → `"private_only"` (replace); `health/hospitals` → `"private_only"` (replace); `education/kindergarten` → `"private_only"` (replace); `education/primary` → `"private_only"` (replace); `education/secondary` → `"private_only"` (replace); `education/vocational` → `"private_only"` (replace); `education/higher` → `"private_only"` (replace).

- **Run public establishments side-by-side with private ones** (`mixed_welfare`; line 1496; shown).
  `infrastructure/maintenance` → `"private_and_public"` (replace); `health/hospitals` → `"public_and_private"` (replace); `education/kindergarten` → `"public_and_private"` (replace); `education/primary` → `"public_and_private"` (replace); `education/secondary` → `"public_and_private"` (replace); `education/vocational` → `"public_and_private"` (replace); `education/higher` → `"public_and_private"` (replace).

- **Nationalize public services** (`nationalized_welfare`; line 1499; shown).
  `infrastructure/maintenance` → `"public"` (replace); `health/hospitals` → `"public"` (replace); `education/kindergarten` → `"public"` (replace); `education/primary` → `"public"` (replace); `education/secondary` → `"public"` (replace); `education/vocational` → `"public"` (replace); `education/higher` → `"public"` (replace).

- **Privatize state-run enterprises** (`privatization`; line 1502; shown).
  `economy/primary` → `"private"` (replace); `economy/secondary` → `"private"` (replace); `economy/tertiary` → `"private"` (replace).

- **Nationalize private enterprises** (`nationalization`; line 1505; shown).
  `economy/primary` → `"state"` (replace); `economy/secondary` → `"state"` (replace); `economy/tertiary` → `"state"` (replace).

- **Enact strict polution standards** (`strict_polution_standards`; line 1509; hidden).
  `environment/polution_standards` → `"strict"` (replace).

- **Enact the most severe polution standards** (`severe_polution_standards`; line 1514; hidden).
  `environment/polution_standards` → `"strict"` (replace).

### Welfare programs (`welfare`)

- **Abolish welfare programs** (`abolish_welfare`; line 1520; shown).
  `welfare/assistance` → `"none"` (replace); `health/health_insurance` → `"private"` (replace); `education/kindergarten_tuition` → `"none"` (replace); `education/primary_tuition` → `"none"` (replace); `education/secondary_tuition` → `"none"` (replace); `education/vocational_tuition` → `"none"` (replace); `education/higher_tuition` → `"none"` (replace); `environment/polution_standards` → `"no"` (replace).

- **Create a social safety net** (`safety_net`; line 1524; shown).
  `welfare/assistance` → `"workfare_only"` (replace); `health/health_insurance` → `"public"` (replace); `education/kindergarten_tuition` → `"partial"` (replace); `education/primary_tuition` → `"high"` (replace); `education/secondary_tuition` → `"high"` (replace); `education/vocational_tuition` → `"partial"` (replace); `education/higher_tuition` → `"partial"` (replace); `environment/polution_standards` → `"some"` (replace).

- **Create extensive social programs** (`extensive_welfare`; line 1528; hidden).
  `welfare/assistance` → `"workfare"` (replace); `health/health_insurance` → `"public"` (replace); `education/kindergarten_tuition` → `"high"` (replace); `education/primary_tuition` → `"high"` (replace); `education/secondary_tuition` → `"high"` (replace); `education/vocational_tuition` → `"high"` (replace); `education/higher_tuition` → `"high"` (replace); `environment/polution_standards` → `"some"` (replace).

- **Abolish law enforcement organizations** (`abolish_police`; line 1533; shown).
  `order/law_enforcement_agencies` → `[]` (replace); `order/forensics` → `[]` (replace); `order/tactical` → `[]` (replace).

- **Create law enforcement organizations** (`law_enforcement`; line 1537; shown).
  `order/law_enforcement_agencies` → `["local", "national"]` (replace); `order/forensics` → `["violent_crimes"]` (replace).

- **Create local police departments** (`create_local_police`; line 1541; hidden).
  `order/law_enforcement_agencies` → `"local"` (add).

- **Create a national law enforcement agency** (`create_national_police`; line 1546; hidden).
  `order/law_enforcement_agencies` → `"national"` (add).

- **Abolish subsides to infrastructure projects** (`abolish_infratructure`; line 1551; shown).
  `infrastructure/investment` → `"none"` (replace).

- **Allocate funds to subside moderate infrastructure projects** (`subside_infrastructure`; line 1555; shown).
  `infrastructure/investment` → `"moderate"` (replace).

- **Allocate funds to subside extensive infrastructure projects** (`extensive_subside_infrastructure`; line 1559; shown).
  `infrastructure/investment` → `"high"` (replace).

## Conditional issues

Conditions are preserved source expressions, never evaluated by the extractor.

### Cut taxes ? (`surpluses`)

Trigger: `"$ps[\"economy_budget_surplus\"] && !$refPs[\"economy\"][\"tax_cut\"]"`

Since the nation has budgetary surpluses, you have room to cut taxes to stimulate the economy strengh and dynamism.

- Use all the surplus to cut taxes → `["economy", "tax_cut"]`
- Use half the surplus to cut taxes → `["economy", "half_income"]`; condition: `"$calc->calc(\"tax\") > 1.05 * Legal_Functions::calcHalfTax($vars[\"nid\"])"`

### Fighting deficit (`deficit`)

Trigger: `"$ps[\"economy_budget_deficit\"] && $ps[\"economy_budget_can_tax_more\"]"`

The budget is actually in deficit. In the long run, this situation can hypothecate financial health. Since taxes are set below the threshold, you could increase the rate.

- Increase taxes just enough to cover deficit → `["economy", "tax_cut"]`
- Increase taxes at the point between balance and maximal income → `["economy", "half_income"]`
- Increase taxes as much as possible to maximize government revenues → `["economy", "max_income"]`

### Criminality is rampant (`rampant_crime`)

Trigger: `"$indPs[\"ci\"][\"bad\"]"`

The current high crime level hurts the economy. Reforming law enforcement by funding local police departments, forensic labs and a national agency may be necessary to curb the problem.

- Create police departments at local level → `["welfare", "create_local_police"]`; condition: `"!isset($legis[\"order\"][\"law_enforcement_agencies\"][\"local\"])"`
- Create a national law enforcement agency → `["welfare", "create_national_police"]`; condition: `"!isset($legis[\"order\"][\"law_enforcement_agencies\"][\"national\"])"`
- Implement a complete reform of law enforcement organizations → `["welfare", "law_enforcement"]`

### High polution (`high_polution`)

Trigger: `"$indPs[\"ni\"][\"bad\"]"`

Environment is now a critical problem. Such a level of polution has a bad incidence over the health level of the population. While damaging for the economy, stricter environmental laws should be envisaged.

- Enact strict polution standards. → `["economy", "strict_polution_standards"]`
- Enact the most severe polution standards. → `["economy", "severe_polution_standards"]`
