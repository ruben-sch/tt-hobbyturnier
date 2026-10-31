# Changelog

## [1.4.0](https://github.com/ruben-sch/tt-hobbyturnier/compare/tt-hobbyturnier-v1.3.0...tt-hobbyturnier-v1.4.0) (2026-10-31)


### Features

* **monitor:** Hallen-Monitor für 4K mit Einzeln und Live-Stand ([aae4a54](https://github.com/ruben-sch/tt-hobbyturnier/commit/aae4a54e2465ff64b35a45ce9b02f9dc149d9a01))
* **monitor:** optimize Hallen-Monitor for 4K and show the singles of each match ([814f6be](https://github.com/ruben-sch/tt-hobbyturnier/commit/814f6be033a52ac615d9ce326c3e76218da02a67)), closes [#29](https://github.com/ruben-sch/tt-hobbyturnier/issues/29)


### Bug Fixes

* **auth:** lock out clients after too many wrong admin PINs ([843b91e](https://github.com/ruben-sch/tt-hobbyturnier/commit/843b91ed49292da5069737684d568a0aa36fd4b5))
* **auth:** lock out clients after too many wrong admin PINs ([9eb1dc2](https://github.com/ruben-sch/tt-hobbyturnier/commit/9eb1dc213cf63f8f3c4299c169f1c2cca7a67b02)), closes [#30](https://github.com/ruben-sch/tt-hobbyturnier/issues/30)

## [1.3.0](https://github.com/ruben-sch/tt-hobbyturnier/compare/tt-hobbyturnier-v1.2.0...tt-hobbyturnier-v1.3.0) (2026-10-27)


### Features

* **admin:** delete the latest round with all its results ([f668391](https://github.com/ruben-sch/tt-hobbyturnier/commit/f668391eaa55a2ee3876361061f65add4812cec8)), closes [#25](https://github.com/ruben-sch/tt-hobbyturnier/issues/25)
* **admin:** letzte Runde samt Ergebnissen löschen ([8e8ee04](https://github.com/ruben-sch/tt-hobbyturnier/commit/8e8ee04a8774c454df03ba23020b1c668b10d6d6))
* **monitor:** fertige Begegnungen markieren, größere Tabellenschrift ([bfe537c](https://github.com/ruben-sch/tt-hobbyturnier/commit/bfe537cc40425eb1de2d73e74186876712d8ddc9))
* **monitor:** keep finished matches of the round and mark them as done ([bd387fd](https://github.com/ruben-sch/tt-hobbyturnier/commit/bd387fd60e8bab313d36c93503e8b18f02c9838c)), closes [#23](https://github.com/ruben-sch/tt-hobbyturnier/issues/23)
* **monitor:** larger font in the standings tables ([8b15558](https://github.com/ruben-sch/tt-hobbyturnier/commit/8b1555852af660a6f5de035764404793f2ec4417)), closes [#24](https://github.com/ruben-sch/tt-hobbyturnier/issues/24)

## [1.2.0](https://github.com/ruben-sch/tt-hobbyturnier/compare/tt-hobbyturnier-v1.1.0...tt-hobbyturnier-v1.2.0) (2026-10-26)


### Features

* MCP server under /mcp to read results and enter them with the admin PIN ([0c29d46](https://github.com/ruben-sch/tt-hobbyturnier/commit/0c29d4617bce8440290bb236e474eb958b0798df))
* MCP server, admin PIN for result entry, Python 3.15 ([e49bea1](https://github.com/ruben-sch/tt-hobbyturnier/commit/e49bea1b2ab56502720217d85883f9fe625df48d))
* OAuth for the MCP server so claude.ai can connect ([0e42d91](https://github.com/ruben-sch/tt-hobbyturnier/commit/0e42d9115cc234d69366965b431c01dcb5eb1e84))
* OAuth for the MCP server so claude.ai can connect ([e8dc40c](https://github.com/ruben-sch/tt-hobbyturnier/commit/e8dc40c774df23e0e98da5eba8ab5fa3dcd983e3))
* print four compact match sheets per A4 page ([30681fb](https://github.com/ruben-sch/tt-hobbyturnier/commit/30681fb9ce415905f4f6b083bde87ba1d56e015d))
* print four compact match sheets per A4 page ([5761b2c](https://github.com/ruben-sch/tt-hobbyturnier/commit/5761b2ca5e28b97ec041f394e5e81be3679ea951))
* remove the lineup confirmation step from result entry ([21485de](https://github.com/ruben-sch/tt-hobbyturnier/commit/21485de31ebbb7a0c6cd373f9aeef1655988e78f))
* remove the lineup confirmation step from result entry ([b6a68a6](https://github.com/ruben-sch/tt-hobbyturnier/commit/b6a68a6f7363a707cb1241df5f2a41174de68253))
* require the admin PIN for result entry and drop match and table PINs ([dc0c748](https://github.com/ruben-sch/tt-hobbyturnier/commit/dc0c748ffbe7b1f659178076e1212f6c2d92dbd5))
* result entry behind the admin PIN in the UI, monitor QR shows live scores ([e517064](https://github.com/ruben-sch/tt-hobbyturnier/commit/e517064fbdc17482be7165fc8e8bafc58fa0b634))
* tournament reset and PDF results archive ([46ea6cd](https://github.com/ruben-sch/tt-hobbyturnier/commit/46ea6cde5a45ffd55fdd56381a6aa27194322e8a))
* Turnier-Reset und PDF-Archivexport ([7019ce1](https://github.com/ruben-sch/tt-hobbyturnier/commit/7019ce1f2b1e5e58d10efb2f2b9ef5c034e1866f))


### Bug Fixes

* flaky PDF-Archivtest (Streams per /Length lesen) ([1ed338f](https://github.com/ruben-sch/tt-hobbyturnier/commit/1ed338f8115e2662f682957e25d761730f088276))
* read PDF streams by /Length in the archive test ([edaaf32](https://github.com/ruben-sch/tt-hobbyturnier/commit/edaaf32a75d8d1156a9638f6d323aec5ed6f720f))

## [1.1.0](https://github.com/ruben-sch/tt-hobbyturnier/compare/tt-hobbyturnier-v1.0.0...tt-hobbyturnier-v1.1.0) (2026-10-26)


### Features

* deploy to a server behind Traefik via release-please ([dea0fae](https://github.com/ruben-sch/tt-hobbyturnier/commit/dea0fae3f92268414fcc488745e3864c6d2125d8))
* deploy to Hetzner like teamtafel (staging on main, production via release-please) ([072fa3d](https://github.com/ruben-sch/tt-hobbyturnier/commit/072fa3d29d6e718ac1a8db0011d06fe09e31d1ba))
* HTTPS via Traefik certresolver for the public server ([6469bd6](https://github.com/ruben-sch/tt-hobbyturnier/commit/6469bd6484aa96fa41c26730b9566296b45f2229))
