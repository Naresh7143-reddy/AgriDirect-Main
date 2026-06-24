package com.agridirect.util;

import com.agridirect.common.util.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Data-driven round-trip coverage for JwtUtil: generates a token for every
 * (userId, role) combination below and asserts every claim extracted back
 * matches what was put in. 30 userIds x 5 roles = 150 cases.
 */
class JwtUtilParameterizedTest {

    private JwtUtil jwtUtil;

    private static final String SECRET =
            "test_jwt_secret_key_must_be_at_least_32_characters_long";
    private static final long EXPIRATION_MS = 3_600_000L;

    private static final String[] ROLES = {"FARMER", "BUYER", "DELIVERY", "ADMIN", "GUEST"};

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        ReflectionTestUtils.setField(jwtUtil, "secret", SECRET);
        ReflectionTestUtils.setField(jwtUtil, "expiration", EXPIRATION_MS);
    }

    static Stream<Arguments> userRoleCombinations() {
        List<Arguments> args = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            String userId = "user-" + i;
            String phone = "+9198" + String.format("%08d", i);
            for (String role : ROLES) {
                args.add(Arguments.of(userId, role, phone));
            }
        }
        return args.stream();
    }

    @ParameterizedTest(name = "[{index}] userId={0}, role={1}")
    @MethodSource("userRoleCombinations")
    @DisplayName("Round-trip token generate/extract preserves userId, role, and phone")
    void roundTrip_preservesAllClaims(String userId, String role, String phone) {
        String token = jwtUtil.generateToken(userId, role, phone);

        assertThat(jwtUtil.isTokenValid(token)).isTrue();
        assertThat(jwtUtil.extractUserId(token)).isEqualTo(userId);
        assertThat(jwtUtil.extractRole(token)).isEqualTo(role);
        assertThat(jwtUtil.extractPhone(token)).isEqualTo(phone);
    }
}
