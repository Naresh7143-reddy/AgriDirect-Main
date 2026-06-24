package com.agridirect.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Data-driven coverage for DiseaseResultParser.mapSeverity: every
 * (severity phrase, urgency phrase, crop) combination below exercises the
 * severity-mapping branch logic with a real parsed response.
 * 4 severities x 3 urgencies x 5 crops = 60 cases.
 */
class DiseaseResultParserParameterizedTest {

    private static final String[] SEVERITIES = {"Severe", "Moderate", "Mild", "Not specified"};
    private static final String[] URGENCIES = {"Act immediately", "Within a week", "No urgency"};
    private static final String[] CROPS = {"tomato", "potato", "wheat", "rice", "cotton"};

    private static String expectedSeverity(String severityRaw, String urgencyRaw) {
        String s = severityRaw.toLowerCase();
        String u = urgencyRaw.toLowerCase();
        if (s.contains("severe") || u.contains("immediately")) return "critical";
        if (s.contains("moderate") || u.contains("within a week")) return "high";
        if (s.contains("mild")) return "medium";
        return "low";
    }

    static Stream<Arguments> severityCombinations() {
        List<Arguments> args = new ArrayList<>();
        for (String severity : SEVERITIES) {
            for (String urgency : URGENCIES) {
                for (String crop : CROPS) {
                    args.add(Arguments.of(severity, urgency, crop, expectedSeverity(severity, urgency)));
                }
            }
        }
        return args.stream();
    }

    @ParameterizedTest(name = "[{index}] severity={0}, urgency={1}, crop={2} -> {3}")
    @MethodSource("severityCombinations")
    @DisplayName("mapSeverity resolves the correct bucket for every severity/urgency combination")
    void parse_mapsSeverityCorrectly(String severityPhrase, String urgencyPhrase, String crop, String expected) {
        String raw = "ISSUE: " + crop + " leaf spot\n" +
                "SEVERITY: " + severityPhrase + "\n" +
                "CAUSE: fungal infection\n" +
                "SYMPTOMS: yellow spots on leaves\n" +
                "TREATMENT: apply fungicide\n" +
                "PREVENTION: rotate crops\n" +
                "URGENCY: " + urgencyPhrase;

        DiseaseDetectionResult result = DiseaseResultParser.parse(raw, crop);

        assertThat(result.getSeverity()).isEqualTo(expected);
        assertThat(result.getAffectedCrops()).containsExactly(crop);
    }
}
