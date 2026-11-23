@e2e
Feature: Customer journey across API and GUI
  API and GUI steps share one browser context (same cookies and session), so data created through the API is
  checked in the GUI in the same scenario.

  @smoke
  Scenario: A customer created through the API appears on the page
    Given a customer named "Ada Lovelace" exists
    When I search the customers page for that customer
    Then the results show only that customer with status "active"

  Scenario: A customer deleted through the API is no longer on the page
    Given a customer named "Alan Turing" exists
    When I delete that customer through the API
    And I search the customers page for that customer
    Then the page says no customers were found

  @mq
  Scenario: A customer event is published and read after the customer is created
    Given a new queue "customer-events"
    And a customer named "Grace Hopper" exists
    When I send the JSON message to queue "customer-events":
      """
      { "event": "customer.created", "source": "e2e" }
      """
    Then I read a message from queue "customer-events"
    And the message field "event" is "customer.created"
    When I search the customers page for that customer
    Then the results show only that customer with status "active"
