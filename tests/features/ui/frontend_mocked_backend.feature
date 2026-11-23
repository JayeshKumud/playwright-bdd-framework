@ui @mock
Feature: Frontend with a mocked backend
  The frontend is tested before its backend is ready: every backend call is answered by a mock file
  (mocks/backend/<name>.json) or a mock set in the step, and a call nobody mocked fails at once.
  This example tests the demo frontend in mocks/demo-frontend. For your own frontend, replace
  "the demo frontend is served" and "I open the customers app" with your page's steps.

  Background:
    Given the demo frontend is served

  @smoke
  Scenario: The list shows the customers the backend returns
    Given the backend is mocked with "customers-list"
    When I open the customers app
    Then the app shows the customers
      | Name         | Status   |
      | Ada Lovelace | active   |
      | Grace Hopper | inactive |
      | Alan Turing  | active   |
    And the app status says "3 customers"
    And the frontend called no unmocked backend endpoint

  Scenario: The frontend shows an error when the backend is down
    Given the backend is mocked with "customers-error"
    When I open the customers app
    Then the app status says "Could not load customers (503)"

  Scenario: One endpoint of a mock file is overridden in the scenario
    Given the backend is mocked with "customers-list"
    And the backend answers GET "/api/customers" with status 500
    When I open the customers app
    Then the app status says "Could not load customers (500)"

  Scenario: Adding a customer sends it to the backend
    Given the backend is mocked with "customers-list"
    When I open the customers app
    And I add the customer "Katherine Johnson" with email "katherine@example.com" in the app
    Then the frontend sent POST "/api/customers" with "name" = "Katherine Johnson"
    And the app status says "Added Katherine Johnson"
