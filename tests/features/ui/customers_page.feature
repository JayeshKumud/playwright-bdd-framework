@ui
Feature: Customers page
  Users can find customers by name and add new customers. Names are made unique per scenario, so these
  scenarios can run in parallel and against shared environments.

  @smoke
  Scenario: Add a customer through the form
    When I add a customer named "Grace Hopper" through the form
    Then the customer can be found by id with status "active"
    And the customer appears in the customer list

  Scenario: Search shows a message when nothing matches
    When I search the customers page for a name that matches nobody
    Then the page says no customers were found

  Scenario: The grid shows this scenario's customers with their status
    Given these customers exist:
      | name          | status   |
      | Ada Lovelace  | active   |
      | Alan Turing   | inactive |
      | Grace Hopper  | active   |
    When I search the customers page for this scenario's customers
    Then the grid is loaded
    And the grid column "Name" contains "Ada Lovelace"
    And the grid column "Name" does not contain "Nobody"
    And the grid column "Name" shows
      | Ada Lovelace |
      | Alan Turing  |
      | Grace Hopper |
    And in the grid rows matching, "Status" is "inactive"
      | Name   | Alan Turing |
    And in the grid rows matching, "Name" is "Alan Turing"
      | Name   | Alan Turing |
      | Status | inactive    |
    And in the grid rows matching, "Status" is "active"
      | Status | active |
    And the page shows "Page 1 of 1"
